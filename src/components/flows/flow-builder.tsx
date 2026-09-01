"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  Handle,
  Position,
  MarkerType,
  type Node,
  type Edge,
  type Connection,
  type NodeProps,
  type NodeTypes,
  type ReactFlowInstance,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft, Play, Save, CheckCircle2, XCircle, Rocket, Pause, BookMarked,
  Clock3, Zap, Database, Filter, ArrowDownUp, Copy, GitBranch, Brain,
  FileText, Bell, Repeat2, ShieldCheck, Globe, History, Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { getNodeMeta as getNode } from "@/lib/flows/catalog";
import type { FlowGraphDoc } from "@/lib/flows/types";
import { catalog } from "@/lib/flows/catalog";
import { createFlowWebMcpTools } from "@/lib/flows/webmcp";
import { builderStateToGraphDoc } from "@/lib/flows/builder-state";
import { useWebMcpTools } from "@/hooks/use-webmcp-tools";
import { ZodForm } from "./zod-form";
import { RunsPanel } from "./runs-panel";
import {
  saveFlow, validateFlowGraph, runFlow, setFlowStatus, publishTemplate,
  provisionFlowWebhookSecret, rotateFlowWebhookSecret,
} from "@/app/actions/flows";

type FlowRow = {
  id: string; name: string; description: string | null;
  graph: unknown; status: string; lastRunAt: Date | string | null;
  webhookConfigured: boolean;
};

const CATEGORY_ICON: Record<string, typeof Zap> = {
  trigger: Zap, data: Database, transform: Filter, ai: Brain, action: FileText, logic: GitBranch,
};

function FlowNode({ data, selected }: NodeProps) {
  const d = data as { label: string; nodeType: string; category: string };
  const def = getNode(d.nodeType);
  const Icon = CATEGORY_ICON[d.category] ?? Zap;
  const accent =
    d.category === "trigger" ? "border-amber-400" :
    d.category === "ai" ? "border-purple-400" :
    d.category === "action" ? "border-emerald-400" : "border-zinc-300 dark:border-zinc-700";

  const outputs = def?.outputs ?? [];
  return (
    <div
      className={`min-w-[150px] rounded-xl border-2 bg-card px-3 py-2 text-card-foreground shadow-md ${accent} ${selected ? "ring-2 ring-indigo-400" : ""}`}
    >
      {(def?.inputs.length ?? 0) > 0 && <Handle type="target" position={Position.Left} />}
      <div className="flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-300">
          <Icon className="h-3.5 w-3.5" />
        </span>
        <span className="text-xs font-semibold">{d.label}</span>
      </div>
      <div className="flex gap-1 mt-1.5 flex-wrap">
        {outputs.map((o) => (
          <span key={o} className="relative text-[10px] text-muted-foreground bg-muted rounded px-1">
            {o}
            <Handle
              type="source"
              position={Position.Right}
              id={o}
              style={{ position: "absolute", right: -7, top: "50%", transform: "translateY(-50%)" }}
            />
          </span>
        ))}
      </div>
    </div>
  );
}

const nodeTypes: NodeTypes = { flowNode: FlowNode };

function graphNodeToReactFlow(node: FlowGraphDoc["nodes"][number]): Node {
  const definition = getNode(node.type);
  return {
    id: node.id,
    type: "flowNode",
    position: node.position,
    data: {
      label: definition?.label ?? node.type,
      nodeType: node.type,
      category: definition?.category ?? "logic",
      config: node.config,
    },
  };
}

function graphEdgeToReactFlow(edge: FlowGraphDoc["edges"][number]): Edge {
  return {
    id: `${edge.from}->${edge.to}:${edge.branch ?? "default"}`,
    source: edge.from,
    target: edge.to,
    sourceHandle: edge.branch,
    animated: true,
    markerEnd: { type: MarkerType.ArrowClosed },
  };
}

export function FlowBuilder({ flow }: { flow: FlowRow }) {
  const router = useRouter();
  const initialGraph = (flow.graph ?? { nodes: [], edges: [] }) as FlowGraphDoc;

  const [rfNodes, setRfNodes, onNodesChange] = useNodesState(
    initialGraph.nodes.map(graphNodeToReactFlow),
  );
  const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState(
    initialGraph.edges.map(graphEdgeToReactFlow),
  );

  const [name, setName] = useState(flow.name);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [runsOpen, setRunsOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [webhookOpen, setWebhookOpen] = useState(false);
  const [webhookConfigured, setWebhookConfigured] = useState(flow.webhookConfigured);
  const [revealedWebhookSecret, setRevealedWebhookSecret] = useState<string | null>(null);
  const webhookUrl = `/api/webhooks/flows/${flow.id}`;
  const [publishMeta, setPublishMeta] = useState({ name: "", description: "", category: "" });
  const [agentChangeCount, setAgentChangeCount] = useState(0);
  const [lastAgentChange, setLastAgentChange] = useState<string | null>(null);
  const idCounter = useRef(1);
  const webMcpNodeCounter = useRef(1);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const reactFlowRef = useRef<ReactFlowInstance<Node, Edge> | null>(null);
  const graphRef = useRef<FlowGraphDoc>(initialGraph);
  const nameRef = useRef(name);
  graphRef.current = builderStateToGraphDoc(rfNodes, rfEdges);
  nameRef.current = name;

  const selectedNode = useMemo(() => rfNodes.find((n) => n.id === selectedId), [rfNodes, selectedId]);
  const selectedDef = selectedNode ? getNode((selectedNode.data as { nodeType: string }).nodeType) : undefined;

  function toGraphDoc(): FlowGraphDoc {
    return graphRef.current;
  }

  const stageAgentGraph = useCallback((graph: FlowGraphDoc, selectedNodeId: string, summary: string) => {
    graphRef.current = graph;
    setRfNodes(graph.nodes.map(graphNodeToReactFlow));
    setRfEdges(graph.edges.map(graphEdgeToReactFlow));
    setSelectedId(selectedNodeId);
    setAgentChangeCount((count) => count + 1);
    setLastAgentChange(summary);
    requestAnimationFrame(() => {
      void reactFlowRef.current?.fitView({ padding: 0.25, duration: 300 });
    });
  }, [setRfEdges, setRfNodes]);

  const stageAgentName = useCallback((nextName: string, summary: string) => {
    nameRef.current = nextName;
    setName(nextName);
    setAgentChangeCount((count) => count + 1);
    setLastAgentChange(summary);
  }, []);

  const nextWebMcpNodeId = useCallback(() => {
    let id: string;
    do {
      id = `wmcp-${Date.now().toString(36)}-${webMcpNodeCounter.current++}`;
    } while (graphRef.current.nodes.some((node) => node.id === id));
    return id;
  }, []);

  const validateStagedGraph = useCallback(async (graph: FlowGraphDoc, signal: AbortSignal) => {
    signal.throwIfAborted();
    const validation = await validateFlowGraph(graph);
    signal.throwIfAborted();
    return validation;
  }, []);

  const webMcpTools = useMemo(() => createFlowWebMcpTools({
    getState: () => ({
      id: flow.id,
      name: nameRef.current,
      status: flow.status,
      graph: graphRef.current,
    }),
    stageGraph: stageAgentGraph,
    stageName: stageAgentName,
    nextNodeId: nextWebMcpNodeId,
    validate: validateStagedGraph,
  }), [flow.id, flow.status, nextWebMcpNodeId, stageAgentGraph, stageAgentName, validateStagedGraph]);
  const webMcpAvailable = useWebMcpTools(webMcpTools);

  const onConnect = useCallback(
    (connection: Connection) =>
      setRfEdges((eds) => addEdge({ ...connection, animated: true, markerEnd: { type: MarkerType.ArrowClosed } }, eds)),
    [setRfEdges],
  );

  function addNodeType(type: string, screenPos: { x: number; y: number }) {
    const def = getNode(type);
    if (!def) return;
    // @xyflow/react exposes project via wrapper instance; approximate with container-relative coords
    const rect = wrapperRef.current?.getBoundingClientRect();
    const zoom = 1;
    const position = {
      x: rect ? screenPos.x - rect.left : screenPos.x,
      y: rect ? screenPos.y - rect.top : screenPos.y,
    };
    const id = `n${Date.now()}${idCounter.current++}`;
    setRfNodes((nds) => [
      ...nds,
      {
        id, type: "flowNode",
        position: { x: position.x / zoom, y: position.y / zoom },
        data: { label: def.label, nodeType: def.type, category: def.category, config: {} },
      } as Node,
    ]);
    setSelectedId(id);
  }

  async function handleValidate() {
    setBusy(true);
    try {
      const res = await validateFlowGraph(toGraphDoc());
      if (res.ok) {
        toast.success("Flow is valid", {
          description: res.issues.filter(i=>i.severity==="warning").map(i=>i.message).join("\n") || undefined,
        });
      } else {
        toast.error(res.issues.filter(i=>i.severity==="error").map(i=>i.message).join("\n"));
      }
    } finally { setBusy(false); }
  }

  async function handleSave() {
    setBusy(true);
    try {
      const res = await saveFlow(flow.id, { name, graph: toGraphDoc() });
      if (res.error || res.issues) {
        toast.error(res.error ?? res.issues!.filter(i=>i.severity==="error").map(i=>i.message).join("\n"));
      } else {
        toast.success("Saved");
        setAgentChangeCount(0);
        setLastAgentChange(null);
        router.refresh();
      }
    } finally { setBusy(false); }
  }

  async function handleTestRun() {
    setBusy(true);
    try {
      const saveRes = await saveFlow(flow.id, { name, graph: toGraphDoc() });
      if (!saveRes.ok) {
        toast.error(saveRes.error ?? saveRes.issues!.map(i=>i.message).join("\n"));
        return;
      }
      setAgentChangeCount(0);
      setLastAgentChange(null);
      const res = await runFlow(flow.id);
      if (res.runId) {
        toast.success("Run finished — opening runs panel");
        setRunsOpen(true);
      } else {
        toast.error(res.error ?? "Run failed");
      }
    } finally { setBusy(false); }
  }

  async function handleToggleActive() {
    const next = flow.status === "active" ? "paused" : "active";
    setBusy(true);
    try {
      const res = await setFlowStatus(flow.id, next);
      if (res.ok) {
        flow.status = next;
        toast.success(next === "active" ? "Flow activated" : "Flow paused");
        router.refresh();
      } else {
        toast.error(res.issues?.map(i=>i.message).join("\n") ?? res.error ?? "Failed");
      }
    } finally { setBusy(false); }
  }

  async function handlePublish() {
    setBusy(true);
    try {
      const res = await publishTemplate(flow.id, publishMeta);
      if (res.slug) {
        toast.success(`Published as template "${publishMeta.name}"`);
        setPublishOpen(false);
      } else toast.error(res.error ?? "Publish failed");
    } finally { setBusy(false); }
  }

  async function handleWebhookSecret() {
    setBusy(true);
    try {
      const res = webhookConfigured
        ? await rotateFlowWebhookSecret(flow.id)
        : await provisionFlowWebhookSecret(flow.id);
      if (res.error) return toast.error(res.error);
      if (res.secret) {
        setWebhookConfigured(true);
        setRevealedWebhookSecret(res.secret);
        toast.success(webhookConfigured ? "Webhook secret rotated" : "Webhook secret created");
      } else {
        setWebhookConfigured(Boolean("configured" in res && res.configured));
        toast.info("A webhook secret is already configured.");
      }
    } finally { setBusy(false); }
  }

  async function copyValue(value: string) {
    await navigator.clipboard.writeText(value);
    toast.success("Copied");
  }

  function updateSelectedConfig(config: Record<string, unknown>) {
    if (!selectedId) return;
    setRfNodes((nds) => nds.map((n) => (n.id === selectedId ? { ...n, data: { ...n.data, config } } : n)));
  }

  const grouped = useMemo(() => {
    const groups: Record<string, { type: string; label: string; description: string; category: string }[]> = {};
    for (const entry of catalog()) (groups[entry.category] ??= []).push(entry);
    return groups;
  }, []);
  const activationBlockedByAgentChanges = flow.status !== "active" && agentChangeCount > 0;

  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden">
      {/* Palette */}
      <aside className="w-56 shrink-0 border-r p-3 space-y-4 overflow-y-auto">
        <Link href="/flows" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-3.5 w-3.5" /> All flows
        </Link>
        {Object.entries(grouped).map(([category, entries]) => (
          <div key={category}>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{category}</p>
            <div className="space-y-1.5">
              {entries.map((entry) => {
                const Icon = CATEGORY_ICON[entry.category] ?? Zap;
                return (
                  <button
                    key={entry.type}
                    title={entry.description}
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData("application/flow-node", entry.type)}
                    onClick={() => addNodeType(entry.type, { x: 120 + Math.random()*200, y: 120 + Math.random()*160 })}
                    className="flex w-full items-center gap-2 rounded-lg border bg-card px-2.5 py-2 text-left text-xs font-medium hover:border-indigo-400 hover:bg-accent transition-colors cursor-grab active:cursor-grabbing"
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0 text-indigo-500" />
                    {entry.label}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </aside>

      {/* Canvas + toolbar */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2 border-b px-4 py-2.5">
          <Input value={name} onChange={(e)=>setName(e.target.value)} className="h-8 w-56 text-sm font-semibold border-none shadow-none px-1" />
          <Badge variant={flow.status === "active" ? "default" : "secondary"} className="text-[10px]">{flow.status}</Badge>
          {webMcpAvailable && (
            <Badge variant="outline" className="gap-1 border-indigo-300 text-[10px] text-indigo-700 dark:border-indigo-800 dark:text-indigo-300">
              <Sparkles className="h-3 w-3" />WebMCP ready
            </Badge>
          )}
          <div className="ml-auto flex items-center gap-1.5">
            <Button size="sm" variant="outline" disabled={busy} onClick={handleValidate}><CheckCircle2 className="mr-1 h-3.5 w-3.5"/>Validate</Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={handleSave}><Save className="mr-1 h-3.5 w-3.5"/>Save</Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={handleTestRun}><Play className="mr-1 h-3.5 w-3.5"/>Test run</Button>
            <Button
              size="sm"
              variant={flow.status === "active" ? "secondary" : "default"}
              disabled={busy || activationBlockedByAgentChanges}
              title={activationBlockedByAgentChanges ? "Save the staged agent changes before activation" : undefined}
              onClick={handleToggleActive}
            >
              {flow.status === "active" ? <><Pause className="mr-1 h-3.5 w-3.5"/>Pause</> : <><Rocket className="mr-1 h-3.5 w-3.5"/>Activate</>}
            </Button>
            <Dialog open={webhookOpen} onOpenChange={(open) => { setWebhookOpen(open); if (!open) setRevealedWebhookSecret(null); }}>
              <DialogTrigger asChild>
                <Button size="sm" variant="ghost"><Globe className="mr-1 h-3.5 w-3.5"/>Webhook</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Incoming webhook</DialogTitle></DialogHeader>
                <div className="space-y-4 text-sm">
                  <div>
                    <p className="mb-1 text-xs font-medium text-muted-foreground">Endpoint</p>
                    <div className="flex gap-2">
                      <Input readOnly value={webhookUrl} />
                      <Button size="icon" variant="outline" onClick={() => copyValue(webhookUrl)}><Copy className="h-4 w-4"/></Button>
                    </div>
                  </div>
                  {revealedWebhookSecret && (
                    <div className="rounded-md border border-amber-300 bg-amber-50 p-3 dark:bg-amber-950/30">
                      <p className="mb-2 font-medium">Copy this secret now. It will not be shown again.</p>
                      <div className="flex gap-2">
                        <Input readOnly value={revealedWebhookSecret} className="font-mono text-xs" />
                        <Button size="icon" variant="outline" onClick={() => copyValue(revealedWebhookSecret)}><Copy className="h-4 w-4"/></Button>
                      </div>
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">Send JSON with <code>Authorization: Bearer &lt;secret&gt;</code>. Use <code>Idempotency-Key</code> when the sender provides a stable delivery ID.</p>
                  <Button className="w-full" variant={webhookConfigured ? "destructive" : "default"} disabled={busy} onClick={handleWebhookSecret}>
                    {webhookConfigured ? "Rotate secret" : "Create secret"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
            <Dialog open={publishOpen} onOpenChange={setPublishOpen}>
              <DialogTrigger asChild>
                <Button size="sm" variant="ghost"><BookMarked className="mr-1 h-3.5 w-3.5"/>Publish</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Publish as template</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <Input placeholder="Template name" value={publishMeta.name} onChange={(e)=>setPublishMeta(p=>({...p,name:e.target.value}))}/>
                  <Input placeholder="Short description" value={publishMeta.description} onChange={(e)=>setPublishMeta(p=>({...p,description:e.target.value}))}/>
                  <Input placeholder="Category (research/content/engagement)" value={publishMeta.category} onChange={(e)=>setPublishMeta(p=>({...p,category:e.target.value}))}/>
                  <Button className="w-full" disabled={!publishMeta.name.trim()||busy} onClick={handlePublish}>Publish to marketplace</Button>
                </div>
              </DialogContent>
            </Dialog>
            <Button size="sm" variant="ghost" onClick={()=>setRunsOpen(true)}><History className="mr-1 h-3.5 w-3.5"/>Runs</Button>
          </div>
        </div>

        {agentChangeCount > 0 && (
          <div
            role="status"
            data-testid="webmcp-staged-banner"
            className="flex items-center gap-2 border-b border-indigo-200 bg-indigo-50 px-4 py-2 text-xs text-indigo-950 dark:border-indigo-900 dark:bg-indigo-950/40 dark:text-indigo-100"
          >
            <Sparkles className="h-3.5 w-3.5 shrink-0" />
            <span className="font-medium">WebMCP staged {agentChangeCount} {agentChangeCount === 1 ? "change" : "changes"}.</span>
            <span className="truncate text-indigo-700 dark:text-indigo-300">{lastAgentChange}</span>
            <span className="ml-auto shrink-0">Review the canvas, then Save or Test run.</span>
          </div>
        )}

        <div className="relative min-h-0 flex-1" ref={wrapperRef}>
          <ReactFlow
            nodes={rfNodes}
            edges={rfEdges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onInit={(instance) => { reactFlowRef.current = instance; }}
            nodeTypes={nodeTypes}
            onNodeClick={(_, node) => setSelectedId(node.id)}
            onPaneClick={() => setSelectedId(null)}
            onDrop={(e) => {
              e.preventDefault();
              const type = e.dataTransfer.getData("application/flow-node");
              if (type) addNodeType(type, { x: e.clientX, y: e.clientY });
            }}
            onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}
            fitView
            proOptions={{ hideAttribution: true }}
          >
            <Background gap={18} />
            <Controls showInteractive={false} />
            <MiniMap pannable zoomable />
          </ReactFlow>

          {/* Config drawer */}
          {selectedDef && selectedNode && (
            <div className="absolute right-4 top-4 z-10 w-80 rounded-xl border bg-background p-4 shadow-lg space-y-3 max-h-[80%] overflow-y-auto">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">{selectedDef.label}</p>
                <button className="text-xs text-muted-foreground hover:text-foreground" onClick={()=>setSelectedId(null)}>✕</button>
              </div>
              <p className="text-xs text-muted-foreground">{selectedDef.description}</p>
              {Object.keys(selectedNode.data as object).includes("config") && (
                <ZodForm
                  schema={selectedDef.configSchema}
                  value={((selectedNode.data as { config?: Record<string, unknown> }).config) ?? {}}
                  onChange={updateSelectedConfig}
                />
              )}
            </div>
          )}
        </div>
      </div>

      <RunsPanel open={runsOpen} onClose={()=>setRunsOpen(false)} flowId={flow.id} />
    </div>
  );
}
