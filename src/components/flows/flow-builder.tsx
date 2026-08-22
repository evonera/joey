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
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft, Play, Save, CheckCircle2, XCircle, Rocket, Pause, BookMarked,
  Clock3, Zap, Database, Filter, ArrowDownUp, Copy, GitBranch, Brain,
  FileText, Bell, Repeat2, ShieldCheck, Globe, History,
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
import { ZodForm } from "./zod-form";
import { RunsPanel } from "./runs-panel";
import {
  saveFlow, validateFlowGraph, runFlow, setFlowStatus, publishTemplate,
  regenerateWebhookSecret,
} from "@/app/actions/flows";

type FlowRow = {
  id: string; name: string; description: string | null;
  graph: unknown; status: string; lastRunAt: Date | string | null;
  webhookSecret?: string | null;
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
      className={`rounded-xl border-2 bg-white dark:bg-zinc-900 px-3 py-2 shadow-md min-w-[150px] ${accent} ${selected ? "ring-2 ring-indigo-400" : ""}`}
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

function WebhookUrlBox({ flowId, secret }: { flowId: string; secret: string }) {
  const [copied, setCopied] = useState(false);
  const url =
    typeof window === "undefined"
      ? `https://joey.evonera.com/api/webhooks/flows/${flowId}?secret=${secret}`
      : `${window.location.origin}/api/webhooks/flows/${flowId}?secret=${secret}`;

  return (
    <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-2.5 space-y-1.5">
      <p className="text-[11px] font-medium">Webhook URL — POST JSON here to start this flow:</p>
      <code className="block break-all rounded bg-muted px-2 py-1.5 font-mono text-[10px]">{url}</code>
      <div className="flex gap-1.5">
        <Button
          size="sm" variant="outline" className="h-6 text-[10px]"
          onClick={() => {
            void navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
        >
          {copied ? "Copied!" : "Copy URL"}
        </Button>
        <Button
          size="sm" variant="ghost" className="h-6 text-[10px]"
          onClick={async () => {
            const res = await regenerateWebhookSecret(flowId);
            if (res.secret) toast.success("Secret regenerated — old URLs are invalid");
            else toast.error(res.error ?? "Failed");
            window.location.reload();
          }}
        >
          Regenerate secret
        </Button>
      </div>
    </div>
  );
}

const nodeTypes: NodeTypes = { flowNode: FlowNode };

export function FlowBuilder({ flow }: { flow: FlowRow }) {
  const router = useRouter();
  const initialGraph = (flow.graph ?? { nodes: [], edges: [] }) as FlowGraphDoc;

  const [rfNodes, setRfNodes, onNodesChange] = useNodesState(
    initialGraph.nodes.map((n) => ({
      id: n.id, type: "flowNode", position: n.position,
      data: { label: getNode(n.type)?.label ?? n.type, nodeType: n.type, category: getNode(n.type)?.category ?? "logic", config: n.config },
    })) as Node[],
  );
  const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState(
    initialGraph.edges.map((e) => ({
      id: `${e.from}->${e.to}${e.branch ?? ""}`, source: e.from, target: e.to,
      sourceHandle: e.branch, animated: true,
      markerEnd: { type: MarkerType.ArrowClosed },
    })) as Edge[],
  );

  const [name, setName] = useState(flow.name);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [runsOpen, setRunsOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [publishMeta, setPublishMeta] = useState({ name: "", description: "", category: "" });
  const idCounter = useRef(1);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const selectedNode = useMemo(() => rfNodes.find((n) => n.id === selectedId), [rfNodes, selectedId]);
  const selectedDef = selectedNode ? getNode((selectedNode.data as { nodeType: string }).nodeType) : undefined;

  function toGraphDoc(): FlowGraphDoc {
    return {
      nodes: rfNodes.map((n) => ({
        id: n.id,
        type: (n.data as { nodeType: string }).nodeType,
        config: ((n.data as { config?: Record<string, unknown> }).config ?? {}),
        position: n.position,
      })),
      edges: rfEdges.map((e) => ({
        from: e.source,
        to: e.target,
        ...(e.sourceHandle && ["true", "false"].includes(e.sourceHandle) ? { branch: e.sourceHandle } : {}),
      })),
    };
  }

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

  function updateSelectedConfig(config: Record<string, unknown>) {
    if (!selectedId) return;
    setRfNodes((nds) => nds.map((n) => (n.id === selectedId ? { ...n, data: { ...n.data, config } } : n)));
  }

  const grouped = useMemo(() => {
    const groups: Record<string, { type: string; label: string; description: string; category: string }[]> = {};
    for (const entry of catalog()) (groups[entry.category] ??= []).push(entry);
    return groups;
  }, []);

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
          <div className="ml-auto flex items-center gap-1.5">
            <Button size="sm" variant="outline" disabled={busy} onClick={handleValidate}><CheckCircle2 className="mr-1 h-3.5 w-3.5"/>Validate</Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={handleSave}><Save className="mr-1 h-3.5 w-3.5"/>Save</Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={handleTestRun}><Play className="mr-1 h-3.5 w-3.5"/>Test run</Button>
            <Button size="sm" variant={flow.status === "active" ? "secondary" : "default"} disabled={busy} onClick={handleToggleActive}>
              {flow.status === "active" ? <><Pause className="mr-1 h-3.5 w-3.5"/>Pause</> : <><Rocket className="mr-1 h-3.5 w-3.5"/>Activate</>}
            </Button>
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

        <div className="relative min-h-0 flex-1" ref={wrapperRef}>
          <ReactFlow
            nodes={rfNodes}
            edges={rfEdges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
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

              {selectedDef.type === "trigger.incoming_webhook" && (
                <WebhookUrlBox flowId={flow.id} secret={flow.webhookSecret ?? ""} />
              )}

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
