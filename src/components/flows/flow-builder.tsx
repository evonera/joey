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
import { useTheme } from "next-themes";
import {
  ArrowLeft01Icon as ArrowLeft,
  PlayIcon as Play,
  FloppyDiskIcon as Save,
  CheckmarkCircle02Icon as CheckCircle2,
  CancelCircleIcon as XCircle,
  Cancel01Icon,
  RocketIcon as Rocket,
  PauseIcon as Pause,
  Bookmark01Icon as BookMarked,
  Clock01Icon as Clock3,
  Copy01Icon as Copy,
  Time04Icon as History,
} from "hugeicons-react";
import {
  Play as PlayLucide,
  Clock as ClockLucide,
  Zap as ZapLucide,
  Globe,
  Bot,
  Search,
  Compass,
  Rss,
  Filter,
  ArrowUpDown,
  Layers,
  GitBranch,
  Repeat,
  ShieldCheck,
  Split,
  Sparkles,
  Image as ImageIcon,
  Mic,
  FileEdit,
  Bell,
  FolderDown,
  LayoutTemplate,
} from "lucide-react";
import { IconBrandYoutube, IconBrandReddit, IconBrandTelegram } from "@tabler/icons-react";
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
import { builderStateToGraphDoc, isAgentReviewSnapshotCurrent } from "@/lib/flows/builder-state";
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

type NodeVisualInfo = {
  icon: React.ComponentType<{ className?: string; size?: number }>;
  colorClass: string;
  bgClass: string;
};

const NODE_VISUAL_MAP: Record<string, NodeVisualInfo> = {
  // Triggers
  "trigger.manual": { icon: PlayLucide, colorClass: "text-emerald-500", bgClass: "bg-emerald-500/10 dark:bg-emerald-500/20" },
  "trigger.schedule": { icon: ClockLucide, colorClass: "text-blue-500", bgClass: "bg-blue-500/10 dark:bg-blue-500/20" },
  "trigger.webhook": { icon: ZapLucide, colorClass: "text-amber-500", bgClass: "bg-amber-500/10 dark:bg-amber-500/20" },
  "trigger.incoming_webhook": { icon: Globe, colorClass: "text-violet-500", bgClass: "bg-violet-500/10 dark:bg-violet-500/20" },

  // Data
  "data.apify_actor": { icon: Bot, colorClass: "text-cyan-500", bgClass: "bg-cyan-500/10 dark:bg-cyan-500/20" },
  "data.exa_search": { icon: Search, colorClass: "text-sky-500", bgClass: "bg-sky-500/10 dark:bg-sky-500/20" },
  "data.tavily_search": { icon: Compass, colorClass: "text-blue-500", bgClass: "bg-blue-500/10 dark:bg-blue-500/20" },
  "data.http": { icon: Globe, colorClass: "text-teal-500", bgClass: "bg-teal-500/10 dark:bg-teal-500/20" },
  "data.rss": { icon: Rss, colorClass: "text-orange-500", bgClass: "bg-orange-500/10 dark:bg-orange-500/20" },
  "data.reddit": { icon: IconBrandReddit as unknown as React.ComponentType<{ className?: string }>, colorClass: "text-orange-600", bgClass: "bg-orange-600/10 dark:bg-orange-600/20" },

  // Transform
  "transform.filter": { icon: Filter, colorClass: "text-purple-500", bgClass: "bg-purple-500/10 dark:bg-purple-500/20" },
  "transform.sort": { icon: ArrowUpDown, colorClass: "text-indigo-500", bgClass: "bg-indigo-500/10 dark:bg-indigo-500/20" },
  "transform.dedupe": { icon: Layers, colorClass: "text-fuchsia-500", bgClass: "bg-fuchsia-500/10 dark:bg-fuchsia-500/20" },

  // Logic
  "logic.condition": { icon: GitBranch, colorClass: "text-amber-500", bgClass: "bg-amber-500/10 dark:bg-amber-500/20" },
  "logic.loop": { icon: Repeat, colorClass: "text-amber-600", bgClass: "bg-amber-600/10 dark:bg-amber-600/20" },
  "logic.approval": { icon: ShieldCheck, colorClass: "text-emerald-500", bgClass: "bg-emerald-500/10 dark:bg-emerald-500/20" },
  "logic.split": { icon: Split, colorClass: "text-amber-500", bgClass: "bg-amber-500/10 dark:bg-amber-500/20" },

  // AI
  "ai.llm": { icon: Sparkles, colorClass: "text-violet-500", bgClass: "bg-violet-500/10 dark:bg-violet-500/20" },
  "ai.transcribe": { icon: Mic, colorClass: "text-rose-500", bgClass: "bg-rose-500/10 dark:bg-rose-500/20" },
  "ai.image": { icon: ImageIcon, colorClass: "text-fuchsia-500", bgClass: "bg-fuchsia-500/10 dark:bg-fuchsia-500/20" },
  "ai.youtube_transcript": { icon: IconBrandYoutube as unknown as React.ComponentType<{ className?: string }>, colorClass: "text-red-500", bgClass: "bg-red-500/10 dark:bg-red-500/20" },

  // Actions
  "action.create_draft": { icon: FileEdit, colorClass: "text-indigo-500", bgClass: "bg-indigo-500/10 dark:bg-indigo-500/20" },
  "action.notify": { icon: Bell, colorClass: "text-amber-500", bgClass: "bg-amber-500/10 dark:bg-amber-500/20" },
  "action.save_asset": { icon: FolderDown, colorClass: "text-emerald-500", bgClass: "bg-emerald-500/10 dark:bg-emerald-500/20" },
  "action.telegram_send": { icon: IconBrandTelegram as unknown as React.ComponentType<{ className?: string }>, colorClass: "text-sky-500", bgClass: "bg-sky-500/10 dark:bg-sky-500/20" },
  "action.theme_studio_run": { icon: LayoutTemplate, colorClass: "text-pink-500", bgClass: "bg-pink-500/10 dark:bg-pink-500/20" },
};

function getNodeVisuals(nodeType: string, category: string): NodeVisualInfo {
  if (NODE_VISUAL_MAP[nodeType]) return NODE_VISUAL_MAP[nodeType];
  switch (category) {
    case "trigger": return { icon: ZapLucide, colorClass: "text-amber-500", bgClass: "bg-amber-500/10" };
    case "data": return { icon: Search, colorClass: "text-blue-500", bgClass: "bg-blue-500/10" };
    case "transform": return { icon: Filter, colorClass: "text-purple-500", bgClass: "bg-purple-500/10" };
    case "ai": return { icon: Sparkles, colorClass: "text-violet-500", bgClass: "bg-violet-500/10" };
    case "action": return { icon: FileEdit, colorClass: "text-indigo-500", bgClass: "bg-indigo-500/10" };
    case "logic": return { icon: GitBranch, colorClass: "text-amber-500", bgClass: "bg-amber-500/10" };
    default: return { icon: ZapLucide, colorClass: "text-primary", bgClass: "bg-primary/10" };
  }
}

function FlowNode({ data, selected }: NodeProps) {
  const d = data as { label: string; nodeType: string; category: string };
  const def = getNode(d.nodeType);
  const visuals = getNodeVisuals(d.nodeType, d.category);
  const IconComponent = visuals.icon;
  const accent =
    d.category === "trigger" ? "border-amber-500/60" :
    d.category === "ai" ? "border-purple-500/60" :
    d.category === "action" ? "border-emerald-500/60" : "border-border";

  const outputs = def?.outputs ?? [];
  return (
    <div
      tabIndex={0}
      role="button"
      aria-pressed={Boolean(selected)}
      aria-label={`${d.label} node (${d.category})`}
      className={`min-w-[155px] rounded-xl border-2 bg-card px-3 py-2 text-card-foreground shadow-md transition-all outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background ${accent} ${selected ? "ring-2 ring-primary" : ""}`}
    >
      {(def?.inputs.length ?? 0) > 0 && <Handle type="target" position={Position.Left} />}
      <div className="flex items-center gap-2">
        <span className={`flex h-6 w-6 items-center justify-center rounded-md ${visuals.bgClass} ${visuals.colorClass}`}>
          <IconComponent className="h-3.5 w-3.5" />
        </span>
        <span className="text-xs font-semibold text-foreground">{d.label}</span>
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
  const { resolvedTheme } = useTheme();
  const colorMode = (resolvedTheme === "dark" ? "dark" : "light") as "dark" | "light";
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
  const agentChangeRevisionRef = useRef(0);
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
    agentChangeRevisionRef.current += 1;
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
    agentChangeRevisionRef.current += 1;
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
    const position = reactFlowRef.current
      ? reactFlowRef.current.screenToFlowPosition({ x: screenPos.x, y: screenPos.y })
      : (() => {
          const rect = wrapperRef.current?.getBoundingClientRect();
          return {
            x: rect ? screenPos.x - rect.left : screenPos.x,
            y: rect ? screenPos.y - rect.top : screenPos.y,
          };
        })();
    const id = `n${Date.now()}${idCounter.current++}`;
    setRfNodes((nds) => [
      ...nds,
      {
        id, type: "flowNode",
        position,
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
    const reviewedAgentRevision = agentChangeRevisionRef.current;
    const reviewedGraph = toGraphDoc();
    const reviewedName = nameRef.current;
    setBusy(true);
    try {
      const res = await saveFlow(flow.id, { name: reviewedName, graph: reviewedGraph });
      if (res.error || res.issues) {
        toast.error(res.error ?? res.issues!.filter(i=>i.severity==="error").map(i=>i.message).join("\n"));
      } else {
        if (isAgentReviewSnapshotCurrent(reviewedAgentRevision, agentChangeRevisionRef.current)) {
          toast.success("Saved");
          setAgentChangeCount(0);
          setLastAgentChange(null);
        } else {
          toast.info("Saved the reviewed snapshot. New WebMCP changes are still staged.");
        }
        router.refresh();
      }
    } finally { setBusy(false); }
  }

  async function handleTestRun() {
    const reviewedAgentRevision = agentChangeRevisionRef.current;
    const reviewedGraph = toGraphDoc();
    const reviewedName = nameRef.current;
    setBusy(true);
    try {
      const saveRes = await saveFlow(flow.id, { name: reviewedName, graph: reviewedGraph });
      if (!saveRes.ok) {
        toast.error(saveRes.error ?? saveRes.issues!.map(i=>i.message).join("\n"));
        return;
      }
      if (!isAgentReviewSnapshotCurrent(reviewedAgentRevision, agentChangeRevisionRef.current)) {
        toast.warning("New WebMCP changes arrived during save. Review them before testing.");
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
                const visuals = getNodeVisuals(entry.type, entry.category);
                const IconComponent = visuals.icon;
                return (
                  <button
                    key={entry.type}
                    title={entry.description}
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData("application/flow-node", entry.type)}
                    onClick={() => addNodeType(entry.type, { x: 120 + Math.random()*200, y: 120 + Math.random()*160 })}
                    className="flex w-full items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-2 text-left text-xs font-medium hover:border-primary/50 hover:bg-accent/50 transition-all cursor-grab active:cursor-grabbing shadow-xs"
                  >
                    <span className={`flex h-5 w-5 items-center justify-center rounded-md ${visuals.bgClass} ${visuals.colorClass} shrink-0`}>
                      <IconComponent className="h-3 w-3" />
                    </span>
                    <span className="truncate text-foreground font-medium">{entry.label}</span>
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
            colorMode={colorMode}
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
            <Background gap={18} color={colorMode === "dark" ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.1)"} />
            <Controls 
              showInteractive={false} 
              className="!bg-card !border-border !shadow-sm !rounded-lg overflow-hidden [&>button]:!bg-card [&>button]:!border-border [&>button]:!fill-foreground [&>button:hover]:!bg-accent" 
            />
            <MiniMap 
              pannable 
              zoomable 
              className="!bg-card !border-border !shadow-sm !rounded-lg overflow-hidden"
              maskColor={colorMode === "dark" ? "rgba(0, 0, 0, 0.75)" : "rgba(240, 240, 240, 0.7)"}
              nodeColor={colorMode === "dark" ? "#6366f1" : "#4f46e5"}
            />
          </ReactFlow>

          {rfNodes.length === 0 && (
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-10 p-4">
              <div className="pointer-events-auto max-w-sm w-full p-6 rounded-2xl border border-border bg-card/90 backdrop-blur-md shadow-xl text-center space-y-4">
                <div className="mx-auto w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center shadow-inner">
                  <Rocket className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground text-base">Your Canvas is Empty</h3>
                  <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
                    Drag a trigger from the left sidebar to start building, or quickly add a starting point below.
                  </p>
                </div>
                <div className="flex flex-col sm:flex-row gap-2 justify-center pt-1">
                  <button
                    type="button"
                    onClick={() => addNodeType("trigger.schedule", { x: 260, y: 180 })}
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-secondary hover:bg-secondary/80 text-foreground transition-colors border border-border shadow-xs"
                  >
                    <Clock3 className="w-3.5 h-3.5 text-indigo-500" />
                    Scheduled Trigger
                  </button>
                  <button
                    type="button"
                    onClick={() => addNodeType("trigger.manual", { x: 260, y: 180 })}
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-secondary hover:bg-secondary/80 text-foreground transition-colors border border-border shadow-xs"
                  >
                    <Play className="w-3.5 h-3.5 text-emerald-500" />
                    Manual Start
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Config drawer */}
          {selectedDef && selectedNode && (
            <div className="absolute right-4 top-4 z-10 w-80 rounded-xl border bg-background p-4 shadow-lg space-y-3 max-h-[80%] overflow-y-auto">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">{selectedDef.label}</p>
                <button className="text-xs text-muted-foreground hover:text-foreground p-1" onClick={()=>setSelectedId(null)}><Cancel01Icon size={14} /></button>
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
