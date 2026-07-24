'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Background,
  Handle,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
  type ReactFlowInstance,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { AlertTriangle, Maximize2, Minimize2, Pencil } from 'lucide-react';
import { useTabStore } from '@/store/useTabStore';
import { useUser } from '@/hooks/useUser';
import { NodeTypeIcon, type NodeType, type DiagramNode as SharedDiagramNode } from '@/lib/networkDiagram';
import { apiFetch } from '@/lib/api';

const SELECTED_KEY = 'redcentra.dashboard.selectedDiagram.v1';
const NODE_W = 76, NODE_H = 56;

/** 대시보드 중앙 위젯 — 사용자가 직접 그려 저장한 네트워크 구성도(networkDiagrams)가 있으면 그것을,
 * 없으면 포트 연결·구성도(cableLinks)로 자동 생성한 연결도를 읽기 전용으로 보여준다.
 * 커스텀 구성도는 편집기(NetworkDiagramEditor)와 동일한 아이콘·색상으로 그려야 하므로
 * @/lib/networkDiagram의 노드 타입/아이콘 정의를 그대로 재사용한다.
 * 두 경우 모두 진행 중인 장애(FAULT)가 걸린 장비 노드를 빨갛게 강조한다. */
interface ApiCableLink {
  id: number;
  srcDeviceId: number;
  srcDeviceName: string;
  destDeviceId: number;
  destDeviceName: string;
}

interface MaintenanceTask {
  id: number;
  kind: 'FAULT' | 'WORK';
  deviceId: number | null;
  status: 'RECEIVED' | 'IN_PROGRESS' | 'DONE';
}

interface DiagramLink { id: string; a: string; b: string; color: string; dash: boolean; }
interface ApiDiagramRow { id: number; companyId: number; name: string; nodes: SharedDiagramNode[]; links: DiagramLink[]; updatedAt: string; }

interface DiagramNodeData extends Record<string, unknown> {
  label: string;
  type?: NodeType;
  alarmed: boolean;
}

/** 편집기(NetworkDiagramEditor)의 노드 카드와 동일한 모양(아이콘 + 다크 카드)으로 그린다. */
function DiagramNodeView({ data }: NodeProps<Node<DiagramNodeData>>) {
  const alarmed = data.alarmed;
  return (
    <div
      style={{
        width: NODE_W,
        height: NODE_H,
        borderRadius: 10,
        background: alarmed ? '#3a1616' : '#0d2b31',
        border: `1.5px solid ${alarmed ? '#ef4444' : '#2a5c63'}`,
        boxShadow: '0 3px 6px rgba(0,0,0,.4)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
      }}
    >
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
      {data.type ? <NodeTypeIcon type={data.type} width={20} height={20} color={alarmed ? '#ff8f8f' : '#9adfd6'} /> : null}
      <span style={{ fontSize: 11, color: alarmed ? '#ffd4d4' : '#d8f3ef', fontWeight: alarmed ? 700 : 400, maxWidth: NODE_W - 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {data.label}
      </span>
    </div>
  );
}

const NODE_TYPES = { diagramNode: DiagramNodeView };

function alarmedStyle(alarmed: boolean) {
  return {
    borderRadius: 8,
    fontSize: 12,
    padding: '6px 10px',
    border: alarmed ? '2px solid #ef4444' : undefined,
    background: alarmed ? '#fef2f2' : undefined,
    color: alarmed ? '#b91c1c' : undefined,
    fontWeight: alarmed ? 700 : 400,
  };
}

function buildAutoGraph(links: ApiCableLink[], alarmedDeviceIds: Set<number>): { nodes: Node[]; edges: Edge[] } {
  const deviceNames = new Map<number, string>();
  for (const l of links) {
    deviceNames.set(l.srcDeviceId, l.srcDeviceName);
    deviceNames.set(l.destDeviceId, l.destDeviceName);
  }

  const ids = [...deviceNames.keys()];
  const cols = Math.max(1, Math.ceil(Math.sqrt(ids.length)));
  const nodes: Node[] = ids.map((id, i) => {
    const alarmed = alarmedDeviceIds.has(id);
    return {
      id: String(id),
      position: { x: (i % cols) * 170 + 20, y: Math.floor(i / cols) * 90 + 20 },
      data: { label: deviceNames.get(id) },
      style: alarmedStyle(alarmed),
      className: alarmed ? 'animate-pulse' : undefined,
    };
  });

  const edges: Edge[] = links.map((l) => {
    const alarmed = alarmedDeviceIds.has(l.srcDeviceId) || alarmedDeviceIds.has(l.destDeviceId);
    return {
      id: String(l.id),
      source: String(l.srcDeviceId),
      target: String(l.destDeviceId),
      animated: alarmed,
      style: alarmed ? { stroke: '#ef4444' } : undefined,
    };
  });

  return { nodes, edges };
}

function buildCustomGraph(diagram: ApiDiagramRow, alarmedDeviceIds: Set<number>): { nodes: Node[]; edges: Edge[] } {
  const sourceNodes = Array.isArray(diagram.nodes) ? diagram.nodes : [];
  const nodes: Node[] = sourceNodes.map((n, index) => {
    const alarmed = n.deviceId != null && alarmedDeviceIds.has(n.deviceId);
    const data: DiagramNodeData = { label: n.label, type: n.type, alarmed };
    const rawX = Number(n.x);
    const rawY = Number(n.y);
    return {
      id: n.id,
      type: 'diagramNode',
      position: {
        x: Number.isFinite(rawX) ? rawX : (index % 4) * 150 + 40,
        y: Number.isFinite(rawY) ? rawY : Math.floor(index / 4) * 100 + 40,
      },
      data,
      className: alarmed ? 'animate-pulse' : undefined,
    };
  });

  const nodeIds = new Set(nodes.map((node) => node.id));
  const sourceLinks = Array.isArray(diagram.links) ? diagram.links : [];
  const edges: Edge[] = sourceLinks.filter((link) => nodeIds.has(link.a) && nodeIds.has(link.b)).map((l) => {
    const a = sourceNodes.find((n) => n.id === l.a);
    const b = sourceNodes.find((n) => n.id === l.b);
    const alarmed = (a?.deviceId != null && alarmedDeviceIds.has(a.deviceId)) || (b?.deviceId != null && alarmedDeviceIds.has(b.deviceId));
    return {
      id: l.id,
      source: l.a,
      target: l.b,
      animated: alarmed,
      style: { stroke: alarmed ? '#ef4444' : l.color, strokeDasharray: l.dash ? '6 4' : undefined },
    };
  });

  return { nodes, edges };
}

export default function DashboardNetworkWidget() {
  const { openTab } = useTabStore();
  const { data: me } = useUser();
  const companyId = me?.companyId ?? null;
  const flowInstance = useRef<ReactFlowInstance<Node, Edge> | null>(null);
  const flowContainer = useRef<HTMLDivElement | null>(null);

  const { data: links = [], isLoading: linksLoading } = useQuery<ApiCableLink[]>({
    queryKey: ['cableLinks'],
    queryFn: async () => {
      const res = await apiFetch('/api/v1/cableLinks');
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: diagramRows, isLoading: diagramLoading } = useQuery<ApiDiagramRow[]>({
    queryKey: ['networkDiagram-dashboard', companyId],
    enabled: companyId != null,
    queryFn: async () => {
      const res = await apiFetch(`/api/v1/networkDiagrams?companyId=${companyId}`);
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: tasks = [], isLoading: tasksLoading } = useQuery<MaintenanceTask[]>({
    queryKey: ['maintenanceTasks'],
    queryFn: async () => {
      const res = await apiFetch('/api/v1/maintenanceTasks');
      if (!res.ok) return [];
      return res.json();
    },
  });

  const alarmedDeviceIds = useMemo(() => {
    const ids = new Set<number>();
    for (const t of tasks) {
      if (t.kind === 'FAULT' && t.status !== 'DONE' && t.deviceId != null) ids.add(t.deviceId);
    }
    return ids;
  }, [tasks]);

  const diagrams = useMemo(
    () => (diagramRows ?? []).filter((r) => Array.isArray(r.nodes) && r.nodes.length > 0).sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1)),
    [diagramRows],
  );

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const toggleFullscreen = async () => {
    if (document.fullscreenElement === flowContainer.current) {
      await document.exitFullscreen();
      return;
    }
    await flowContainer.current?.requestFullscreen();
  };

  // 사용자가 마지막으로 선택한 구성도를 기억한다 (회사별로 구분해 저장)
  useEffect(() => {
    if (companyId == null || diagrams.length === 0) return;
    try {
      const saved = JSON.parse(window.localStorage.getItem(SELECTED_KEY) ?? '{}');
      const savedId = saved[companyId];
      setSelectedId(diagrams.some((d) => d.id === savedId) ? savedId : diagrams[0].id);
    } catch {
      setSelectedId(diagrams[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, diagrams.length]);

  function selectDiagram(id: number) {
    setSelectedId(id);
    if (companyId == null) return;
    const saved = JSON.parse(window.localStorage.getItem(SELECTED_KEY) ?? '{}');
    saved[companyId] = id;
    window.localStorage.setItem(SELECTED_KEY, JSON.stringify(saved));
  }

  const customDiagram = diagrams.find((d) => d.id === selectedId) ?? diagrams[0] ?? null;

  const { nodes, edges } = useMemo(
    () => (customDiagram ? buildCustomGraph(customDiagram, alarmedDeviceIds) : buildAutoGraph(links, alarmedDeviceIds)),
    [customDiagram, links, alarmedDeviceIds],
  );

  const fitWholeDiagram = useCallback(() => {
    window.requestAnimationFrame(() => {
      const instance = flowInstance.current;
      const container = flowContainer.current;
      if (!instance || !container || nodes.length === 0) return;
      const { width, height } = container.getBoundingClientRect();
      if (!Number.isFinite(width) || !Number.isFinite(height) || width < 20 || height < 20) return;
      if (nodes.some((node) => !Number.isFinite(node.position.x) || !Number.isFinite(node.position.y))) return;
      void instance.fitView({ padding: 0.08, minZoom: 0.1, maxZoom: 1.35, duration: 350 });
    });
  }, [nodes]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === flowContainer.current);
      fitWholeDiagram();
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, [fitWholeDiagram]);

  useEffect(() => {
    fitWholeDiagram();
  }, [nodes, edges, fitWholeDiagram]);

  useEffect(() => {
    const container = flowContainer.current;
    if (!container) return;
    let frame = 0;
    const observer = new ResizeObserver(() => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(fitWholeDiagram);
    });
    observer.observe(container);
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [fitWholeDiagram]);

  if (linksLoading || tasksLoading || diagramLoading) {
    return <div className="p-2 text-sm text-slate-400">불러오는 중...</div>;
  }

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          {diagrams.length > 0 ? (
            <select
              value={customDiagram?.id ?? ''}
              onChange={(e) => selectDiagram(Number(e.target.value))}
              className="h-7 max-w-[160px] rounded-md border border-white/15 bg-white/5 px-1.5 text-xs text-slate-200 outline-none"
            >
              {diagrams.map((d) => (
                <option key={d.id} value={d.id} className="text-black">{d.name}</option>
              ))}
            </select>
          ) : (
            <span className="text-xs text-slate-400">자동 생성된 연결도</span>
          )}
          {alarmedDeviceIds.size > 0 && (
            <div className="flex items-center gap-1 text-xs font-medium text-red-500">
              <AlertTriangle className="h-3.5 w-3.5" />
              장애 {alarmedDeviceIds.size}건
            </div>
          )}
        </div>
        <button
          onClick={() => openTab('NET_DIAGRAM_EDIT', '네트워크 구성도 편집')}
          className="flex shrink-0 items-center gap-1 text-xs font-medium text-cyan-300 hover:text-cyan-200 hover:underline"
        >
          <Pencil className="h-3 w-3" /> 직접 그리기
        </button>
      </div>
      <div ref={flowContainer} className="relative min-h-0 w-full flex-1 overflow-hidden rounded-md border bg-[#081124]">
        <button
          type="button"
          onClick={() => void toggleFullscreen()}
          className="absolute right-2 top-2 z-20 flex h-8 items-center gap-1.5 rounded-md border border-cyan-300/40 bg-[#0b1b2f]/90 px-2.5 text-xs font-medium text-cyan-200 shadow-lg backdrop-blur hover:border-cyan-200 hover:bg-[#102944]"
          title={isFullscreen ? '전체 화면 종료 (Esc)' : '전체 화면으로 보기'}
        >
          {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          {isFullscreen ? '축소' : '전체 화면'}
        </button>
        <ReactFlow
          key={customDiagram ? `custom-${customDiagram.id}` : 'auto'}
          nodes={nodes}
          edges={edges}
          nodeTypes={NODE_TYPES}
          fitView
          fitViewOptions={{ padding: 0.08, minZoom: 0.1, maxZoom: 1.35 }}
          onInit={(instance) => { flowInstance.current = instance; fitWholeDiagram(); }}
          proOptions={{ hideAttribution: true }}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          zoomOnScroll={false}
          panOnScroll
        >
          <Background />
        </ReactFlow>
      </div>
    </div>
  );
}
