'use client';

import { useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  MousePointer2, Cable, Boxes, Trash2, Save, FilePlus2, Pencil,
  Search, CircleDot, WandSparkles,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useUser } from '@/hooks/useUser';
import { cn } from '@/lib/utils';
import {
  NODE_ICON, PALETTE,
  type NodeType, type DiagramNode, type DiagramLink, type DiagramZone, type DiagramState,
} from '@/lib/networkDiagram';

/** 네트워크 구성도 편집기 — 사용자가 자신의 조직 네트워크망을 직접 그려서 저장한다.
 * 저장된 구성도는 대시보드 위젯에서 그대로 불러와 장애 알람과 연동해 보여준다.
 * 노드 타입/아이콘 정의는 @/lib/networkDiagram에서 대시보드 위젯과 공유한다. */
export type { DiagramNode, DiagramLink, DiagramZone, DiagramState };

interface ApiDiagramRow extends DiagramState { id: number; companyId: number; name: string; updatedAt: string; }

const EMPTY_DIAGRAM: DiagramState = { nodes: [], links: [], zones: [] };

const LINE_COLORS = ['#35e0c8', '#ffb03a', '#ff5f7a', '#7ad46a', '#5aa9ff', '#c58cff', '#9aa7a5'];

const NODE_W = 168, NODE_H = 82;
let idSeq = 1;
const uid = (p: string) => `${p}${idSeq++}`;

type Mode = 'select' | 'connect' | 'zone';
type Selected = { kind: 'node' | 'link' | 'zone'; id: string } | null;

interface ApiPort {
  id: number;
  portName?: string;
  deviceNetworkName?: string;
  connectionAddress?: string;
  type?: string;
}

interface ApiDevice {
  id: number;
  deviceName: string;
  deviceType?: string;
  hostName?: string;
  modelName?: string;
  status?: string;
  ports?: ApiPort[];
}

interface PendingLink {
  sourceNodeId: string;
  destNodeId: string;
}

interface ApiRoom {
  id: number;
  roomName: string;
  floor?: number;
  racks: { id: number; rackName: string; posX: number; posY: number }[];
}

interface ApiRackDetail {
  id: number;
  rackName: string;
  devices: ApiDevice[];
}

interface ApiCableLink {
  id: number;
  srcDeviceId: number;
  srcDeviceName?: string;
  srcPortName?: string;
  destDeviceId: number;
  destDeviceName?: string;
  destPortName?: string;
  cableType?: string;
  color?: string;
}

function nodeTypeForDevice(device: ApiDevice): NodeType {
  const value = `${device.deviceType ?? ''} ${device.deviceName} ${device.modelName ?? ''}`.toUpperCase();
  if (/BACKBONE|CORE|백본/.test(value)) return 'backbone';
  if (/FIREWALL|방화벽|UTM/.test(value)) return 'firewall';
  if (/IPS|IDS/.test(value)) return 'ips';
  if (/DDOS/.test(value)) return 'ddos';
  if (/ROUTER|라우터/.test(value)) return 'router';
  if (/L3/.test(value)) return 'l3';
  if (/SWITCH|스위치/.test(value)) return 'switch';
  if (/DATABASE|\bDB\b/.test(value)) return 'db';
  return 'server';
}

export default function NetworkDiagramEditor() {
  const queryClient = useQueryClient();
  const { data: me } = useUser();
  const companyId = me?.companyId ?? null;

  const svgRef = useRef<SVGSVGElement>(null);
  const [diagram, setDiagram] = useState<DiagramState>(EMPTY_DIAGRAM);
  const [rowId, setRowId] = useState<number | null>(null);
  const [name, setName] = useState('새 구성도');
  const [mode, setMode] = useState<Mode>('select');
  const [lineColor, setLineColor] = useState(LINE_COLORS[0]);
  const [dash, setDash] = useState(false);
  const [selected, setSelected] = useState<Selected>(null);
  const [connectFrom, setConnectFrom] = useState<string | null>(null);
  const [connectPointer, setConnectPointer] = useState<{ x: number; y: number } | null>(null);
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const [editingNode, setEditingNode] = useState<DiagramNode | null>(null);
  const [editingZone, setEditingZone] = useState<DiagramZone | null>(null);
  const [deviceSearch, setDeviceSearch] = useState('');
  const [pendingLink, setPendingLink] = useState<PendingLink | null>(null);
  const [route, setRoute] = useState<'ORTHOGONAL' | 'CURVED' | 'STRAIGHT'>('ORTHOGONAL');
  const [selectedRoomId, setSelectedRoomId] = useState('');
  const dragRef = useRef<
    | { type: 'node' | 'zone'; id: string; dx: number; dy: number }
    | { type: 'zone-resize'; id: string }
    | { type: 'zone-draw'; id: string; sx: number; sy: number }
    | { type: 'pan'; sx: number; sy: number; ox: number; oy: number }
    | null
  >(null);

  const { data: devices = [] } = useQuery<ApiDevice[]>({
    queryKey: ['devices-min'],
    queryFn: async () => {
      const res = await fetch('/api/v1/devices');
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: rooms = [] } = useQuery<ApiRoom[]>({
    queryKey: ['rooms-diagram-auto'],
    queryFn: async () => {
      const res = await fetch('/api/v1/rooms?page=1&size=100');
      if (!res.ok) return [];
      const result = await res.json();
      return Array.isArray(result) ? result : result.content ?? result.items ?? [];
    },
  });

  const { data: cableLinks = [] } = useQuery<ApiCableLink[]>({
    queryKey: ['cableLinks'],
    queryFn: async () => {
      const res = await fetch('/api/v1/cableLinks');
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: rows, isLoading } = useQuery<ApiDiagramRow[]>({
    queryKey: ['networkDiagrams', companyId],
    enabled: companyId != null,
    queryFn: async () => {
      const res = await fetch(`/api/v1/networkDiagrams?companyId=${companyId}`);
      if (!res.ok) return [];
      return res.json();
    },
  });

  function loadRow(row: ApiDiagramRow | undefined) {
    setRowId(row?.id ?? null);
    setName(row?.name ?? '새 구성도');
    if (row) {
      // uid()가 발급하는 새 id가 불러온 기존 id와 충돌하지 않도록 시퀀스를 최댓값 이후로 맞춘다.
      const maxId = [...row.nodes, ...row.links, ...row.zones]
        .map((o) => parseInt(o.id.replace(/\D/g, ''), 10) || 0)
        .reduce((a, b) => Math.max(a, b), 0);
      idSeq = Math.max(idSeq, maxId + 1);
    }
    setDiagram(row ? { nodes: row.nodes, links: row.links, zones: row.zones } : EMPTY_DIAGRAM);
    setSelected(null);
  }

  // 최초 로드 시 가장 최근에 저장된 구성도를 캔버스에 반영 (SSR/hydration 안전을 위해 마운트 후 1회)
  useEffect(() => {
    if (!rows) return;
    const latest = [...rows].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))[0];
    loadRow(latest);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows === undefined]);

  function startNew() {
    if (diagram.nodes.length > 0 && !confirm('저장하지 않은 변경사항이 있을 수 있습니다. 새 구성도를 시작할까요?')) return;
    setRowId(null);
    setName('새 구성도');
    setDiagram(EMPTY_DIAGRAM);
    setSelected(null);
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (companyId == null) return;
      const finalName = name.trim() || '이름 없는 구성도';
      if (rowId != null) {
        const res = await fetch(`/api/v1/networkDiagrams/${rowId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: finalName, ...diagram, updatedAt: new Date().toISOString() }),
        });
        if (!res.ok) throw new Error('저장 실패');
        return res.json();
      }
      const res = await fetch('/api/v1/networkDiagrams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, name: finalName, ...diagram, updatedAt: new Date().toISOString() }),
      });
      if (!res.ok) throw new Error('저장 실패');
      return res.json();
    },
    onSuccess: (row: ApiDiagramRow | undefined) => {
      if (row) { setRowId(row.id); setName(row.name); }
      queryClient.invalidateQueries({ queryKey: ['networkDiagrams', companyId] });
      queryClient.invalidateQueries({ queryKey: ['networkDiagram-dashboard', companyId] });
    },
  });

  function toWorld(clientX: number, clientY: number) {
    const r = svgRef.current!.getBoundingClientRect();
    return { x: (clientX - r.left - view.x) / view.k, y: (clientY - r.top - view.y) / view.k };
  }
  function screenCenter() {
    const r = svgRef.current!.getBoundingClientRect();
    return toWorld(r.left + r.width / 2, r.top + r.height / 2);
  }

  function addNode(type: NodeType, label: string, x: number, y: number) {
    const node: DiagramNode = { id: uid('n'), type, label, x, y, deviceId: null };
    setDiagram((d) => ({ ...d, nodes: [...d.nodes, node] }));
  }

  function addDeviceNode(device: ApiDevice) {
    if (diagram.nodes.some((node) => node.deviceId === device.id)) {
      setSelected({ kind: 'node', id: diagram.nodes.find((node) => node.deviceId === device.id)!.id });
      return;
    }
    const center = screenCenter();
    const offset = diagram.nodes.length % 5;
    const node: DiagramNode = {
      id: uid('n'),
      type: nodeTypeForDevice(device),
      label: device.deviceName,
      x: center.x + offset * 34 - 68,
      y: center.y + offset * 24 - 48,
      deviceId: device.id,
      hostName: device.hostName,
      modelName: device.modelName,
      managementIp: device.ports?.find((port) => port.connectionAddress)?.connectionAddress,
      status: device.status,
    };
    setDiagram((current) => ({ ...current, nodes: [...current.nodes, node] }));
    setSelected({ kind: 'node', id: node.id });
  }

  function autoArrange() {
    setDiagram((current) => ({
      ...current,
      nodes: current.nodes.map((node, index) => ({
        ...node,
        x: 180 + (index % 4) * 230,
        y: 130 + Math.floor(index / 4) * 150,
      })),
    }));
    setView({ x: 0, y: 0, k: 1 });
  }

  const autoGenerateMutation = useMutation({
    mutationFn: async (roomId: number) => {
      const room = rooms.find((item) => item.id === roomId);
      if (!room) throw new Error('선택한 서버실을 찾을 수 없습니다.');
      const rackDetails = await Promise.all((room.racks ?? []).map(async (rack) => {
        const res = await fetch(`/api/v1/racks/${rack.id}`);
        if (!res.ok) return { id: rack.id, rackName: rack.rackName, devices: [] } satisfies ApiRackDetail;
        return res.json() as Promise<ApiRackDetail>;
      }));
      return { room, rackDetails };
    },
    onSuccess: ({ room, rackDetails }) => {
      const allDevices = rackDetails.flatMap((rack) => rack.devices);
      const roomDeviceIds = new Set(allDevices.map((device) => device.id));
      const deviceById = new Map(devices.map((device) => [device.id, device]));
      const rackColumns = Math.max(1, Math.ceil(Math.sqrt(rackDetails.length)));
      const nodes: DiagramNode[] = [];
      const zones: DiagramZone[] = [];

      rackDetails.forEach((rack, rackIndex) => {
        const rackCol = rackIndex % rackColumns;
        const rackRow = Math.floor(rackIndex / rackColumns);
        const deviceRows = Math.max(1, Math.ceil(rack.devices.length / 2));
        const zoneX = 70 + rackCol * 430;
        const zoneY = 70 + rackRow * Math.max(300, deviceRows * 112 + 90);
        const zoneW = 380;
        const zoneH = Math.max(230, deviceRows * 105 + 70);
        zones.push({ id: `z-rack-${rack.id}`, x: zoneX, y: zoneY, w: zoneW, h: zoneH, label: rack.rackName, color: '#35e0c8' });

        rack.devices.forEach((rackDevice, deviceIndex) => {
          const detail = deviceById.get(rackDevice.id) ?? rackDevice;
          nodes.push({
            id: `n-device-${rackDevice.id}`,
            type: nodeTypeForDevice(detail),
            label: detail.deviceName,
            x: zoneX + 105 + (deviceIndex % 2) * 180,
            y: zoneY + 65 + Math.floor(deviceIndex / 2) * 100,
            deviceId: detail.id,
            hostName: detail.hostName,
            modelName: detail.modelName,
            managementIp: detail.ports?.find((port) => port.connectionAddress)?.connectionAddress,
            status: detail.status,
          });
        });
      });

      const cableColor = (link: ApiCableLink) => link.color || (/FIBER|OPTIC/i.test(link.cableType ?? '') ? '#ffb03a' : /DAC/i.test(link.cableType ?? '') ? '#c58cff' : '#35e0c8');
      const links: DiagramLink[] = cableLinks
        .filter((link) => roomDeviceIds.has(link.srcDeviceId) && roomDeviceIds.has(link.destDeviceId))
        .map((link) => ({
          id: `l-cable-${link.id}`,
          a: `n-device-${link.srcDeviceId}`,
          b: `n-device-${link.destDeviceId}`,
          color: cableColor(link),
          dash: false,
          sourcePortName: link.srcPortName || 'AUTO',
          destPortName: link.destPortName || 'AUTO',
          cableType: link.cableType || 'UTP',
          route: 'ORTHOGONAL',
        }));

      setDiagram({ nodes, links, zones });
      setName(`${room.roomName} 네트워크 구성도`);
      setRowId(null);
      setSelected(null);
      setView({ x: 20, y: 20, k: rackDetails.length > 4 ? 0.7 : 0.85 });
    },
  });

  function generateFromRoom() {
    if (!selectedRoomId) return;
    if (diagram.nodes.length > 0 && !confirm('현재 편집 중인 구성도를 서버실 자동 구성으로 교체할까요?')) return;
    autoGenerateMutation.mutate(Number(selectedRoomId));
  }

  function deleteSelected() {
    if (!selected) return;
    setDiagram((d) => {
      if (selected.kind === 'node') {
        return {
          ...d,
          nodes: d.nodes.filter((n) => n.id !== selected.id),
          links: d.links.filter((l) => l.a !== selected.id && l.b !== selected.id),
        };
      }
      if (selected.kind === 'link') return { ...d, links: d.links.filter((l) => l.id !== selected.id) };
      return { ...d, zones: d.zones.filter((z) => z.id !== selected.id) };
    });
    setSelected(null);
  }

  function handlePointerDownSvg(e: React.PointerEvent<SVGSVGElement>) {
    const target = e.target as SVGElement;
    const nodeEl = target.closest('[data-node-id]');
    const zoneEl = target.closest('[data-zone-id]');
    const linkEl = target.closest('[data-link-id]');
    const p = toWorld(e.clientX, e.clientY);

    if (mode === 'connect') {
      if (nodeEl) {
        const id = nodeEl.getAttribute('data-node-id')!;
        if (!connectFrom) {
          setConnectFrom(id);
          setConnectPointer(p);
        }
        else if (connectFrom !== id) {
          const duplicate = diagram.links.some((link) =>
            (link.a === connectFrom && link.b === id) || (link.a === id && link.b === connectFrom),
          );
          if (!duplicate) setPendingLink({ sourceNodeId: connectFrom, destNodeId: id });
          setConnectFrom(null);
          setConnectPointer(null);
        }
      } else {
        setConnectFrom(null);
        setConnectPointer(null);
      }
      return;
    }

    if (mode === 'zone') {
      const zone: DiagramZone = { id: uid('z'), x: p.x, y: p.y, w: 10, h: 10, label: '새 구역', color: lineColor };
      setDiagram((d) => ({ ...d, zones: [...d.zones, zone] }));
      dragRef.current = { type: 'zone-draw', id: zone.id, sx: p.x, sy: p.y };
      svgRef.current!.setPointerCapture(e.pointerId);
      return;
    }

    if (nodeEl) {
      const id = nodeEl.getAttribute('data-node-id')!;
      const n = diagram.nodes.find((x) => x.id === id)!;
      setSelected({ kind: 'node', id });
      dragRef.current = { type: 'node', id, dx: p.x - n.x, dy: p.y - n.y };
    } else if (zoneEl && target.hasAttribute('data-zone-handle')) {
      const id = zoneEl.getAttribute('data-zone-id')!;
      setSelected({ kind: 'zone', id });
      dragRef.current = { type: 'zone-resize', id };
    } else if (zoneEl) {
      const id = zoneEl.getAttribute('data-zone-id')!;
      const z = diagram.zones.find((x) => x.id === id)!;
      setSelected({ kind: 'zone', id });
      dragRef.current = { type: 'zone', id, dx: p.x - z.x, dy: p.y - z.y };
    } else if (linkEl) {
      const id = linkEl.getAttribute('data-link-id')!;
      const link = diagram.links.find((item) => item.id === id);
      setSelected({ kind: 'link', id });
      if (link) { setLineColor(link.color); setDash(link.dash); }
    } else {
      setSelected(null);
      dragRef.current = { type: 'pan', sx: e.clientX, sy: e.clientY, ox: view.x, oy: view.y };
    }
    svgRef.current!.setPointerCapture(e.pointerId);
  }

  function handlePointerMoveSvg(e: React.PointerEvent<SVGSVGElement>) {
    const p = toWorld(e.clientX, e.clientY);
    if (mode === 'connect' && connectFrom) setConnectPointer(p);
    const drag = dragRef.current;
    if (!drag) return;
    if (drag.type === 'node') {
      setDiagram((d) => ({ ...d, nodes: d.nodes.map((n) => (n.id === drag.id ? { ...n, x: p.x - drag.dx, y: p.y - drag.dy } : n)) }));
    } else if (drag.type === 'zone') {
      setDiagram((d) => ({ ...d, zones: d.zones.map((z) => (z.id === drag.id ? { ...z, x: p.x - drag.dx, y: p.y - drag.dy } : z)) }));
    } else if (drag.type === 'zone-resize' || drag.type === 'zone-draw') {
      setDiagram((d) => ({
        ...d,
        zones: d.zones.map((z) => {
          if (z.id !== drag.id) return z;
          if (drag.type === 'zone-draw') {
            return { ...z, x: Math.min(drag.sx, p.x), y: Math.min(drag.sy, p.y), w: Math.max(20, Math.abs(p.x - drag.sx)), h: Math.max(20, Math.abs(p.y - drag.sy)) };
          }
          return { ...z, w: Math.max(40, p.x - z.x), h: Math.max(40, p.y - z.y) };
        }),
      }));
    } else if (drag.type === 'pan') {
      setView((v) => ({ ...v, x: drag.ox + (e.clientX - drag.sx), y: drag.oy + (e.clientY - drag.sy) }));
    }
  }

  function handlePointerUpSvg() {
    const drag = dragRef.current;
    if (drag?.type === 'zone-draw') {
      setDiagram((d) => {
        const z = d.zones.find((x) => x.id === drag.id);
        if (z && (z.w < 30 || z.h < 30)) return { ...d, zones: d.zones.filter((x) => x.id !== drag.id) };
        return d;
      });
      setMode('select');
    }
    dragRef.current = null;
  }

  function handleWheel(e: React.WheelEvent<SVGSVGElement>) {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    const k2 = Math.min(3, Math.max(0.3, view.k * factor));
    const r = svgRef.current!.getBoundingClientRect();
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    setView((v) => ({ x: mx - (mx - v.x) * (k2 / v.k), y: my - (my - v.y) * (k2 / v.k), k: k2 }));
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === 'Delete' || e.key === 'Backspace') deleteSelected();
      else if (e.key === 'Escape') { setConnectFrom(null); setConnectPointer(null); setSelected(null); }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, diagram]);

  return (
    <div className="flex h-full flex-col bg-[#071518] text-[#d8f3ef]">
      {/* 구성도 선택/이름 */}
      <div className="flex flex-wrap items-center gap-2.5 border-b border-[#1d444c] bg-[#0a1e23] px-3.5 py-2">
        <span className="text-[11px] text-[#6fa3a0]">저장된 구성도</span>
        <select
          value={rowId ?? ''}
          onChange={(e) => loadRow(rows?.find((r) => r.id === Number(e.target.value)))}
          className="h-8 min-w-[160px] rounded-md border border-[#1d444c] bg-[#0f2b31] px-2 text-[12px]"
        >
          {rowId == null && <option value="">(새 구성도 — 아직 저장 안 됨)</option>}
          {rows?.map((r) => (
            <option key={r.id} value={r.id}>{r.name}</option>
          ))}
        </select>
        <button onClick={startNew} className="flex items-center gap-1 rounded-md border border-[#1d444c] bg-[#0f2b31] px-2.5 py-1.5 text-[12px] hover:border-[#35e0c8] hover:text-[#35e0c8]">
          <FilePlus2 className="h-3.5 w-3.5" /> 새로 만들기
        </button>
        <div className="h-5 w-px bg-[#1d444c]" />
        <span className="text-[11px] text-[#6fa3a0]">이름</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="구성도 이름"
          className="h-8 w-[200px] rounded-md border border-[#1d444c] bg-[#0f2b31] px-2.5 text-[12px] outline-none focus:border-[#35e0c8]"
        />
        <div className="ml-auto flex items-center gap-2 rounded-lg border border-[#2a5c63] bg-[#071518] p-1">
          <span className="pl-2 text-[10px] font-semibold text-[#6fa3a0]">서버실 자동 구성</span>
          <select value={selectedRoomId} onChange={(event) => setSelectedRoomId(event.target.value)} className="h-7 min-w-[170px] rounded-md border border-[#1d444c] bg-[#0f2b31] px-2 text-[11px]">
            <option value="">서버실 선택</option>
            {rooms.map((room) => <option key={room.id} value={room.id}>{room.roomName}{room.floor != null ? ` · ${room.floor}층` : ''}</option>)}
          </select>
          <button onClick={generateFromRoom} disabled={!selectedRoomId || autoGenerateMutation.isPending} className="flex h-7 items-center gap-1 rounded-md bg-[#35e0c8] px-2.5 text-[11px] font-bold text-[#04211d] hover:bg-[#70f0df] disabled:opacity-40">
            <WandSparkles className="h-3.5 w-3.5" /> {autoGenerateMutation.isPending ? '생성 중...' : '자동 그리기'}
          </button>
        </div>
      </div>

      {/* 툴바 */}
      <div className="flex flex-wrap items-center gap-2.5 border-b border-[#1d444c] bg-gradient-to-b from-[#0e2a30] to-[#0a1e23] px-3.5 py-2">
        <span className="mr-1 text-[13px] font-bold tracking-widest text-[#35e0c8]">네트워크 구성도</span>
        <ToolBtn active={mode === 'select'} onClick={() => { setMode('select'); setConnectFrom(null); setConnectPointer(null); }} icon={MousePointer2} label="선택/이동" />
        <ToolBtn active={mode === 'connect'} onClick={() => { setMode('connect'); setConnectFrom(null); setConnectPointer(null); }} icon={Cable} label="연결선" />
        <ToolBtn active={mode === 'zone'} onClick={() => { setMode('zone'); setConnectFrom(null); setConnectPointer(null); }} icon={Boxes} label="구역" />
        <div className="h-5 w-px bg-[#1d444c]" />
        <div className="flex items-center gap-1.5" title="연결선 색상">
          {LINE_COLORS.map((c) => (
            <button
              key={c}
              onClick={() => {
                setLineColor(c);
                if (selected?.kind === 'link') setDiagram((d) => ({ ...d, links: d.links.map((l) => (l.id === selected.id ? { ...l, color: c } : l)) }));
              }}
              className={cn('h-6 w-6 rounded-full border-2 transition-transform hover:scale-110', lineColor === c ? 'scale-110 border-white shadow-[0_0_8px_currentColor]' : 'border-white/20')}
              style={{ backgroundColor: c, color: c }}
              aria-label={`연결선 색상 ${c}`}
            />
          ))}
        </div>
        <select
          value={dash ? 'dashed' : 'solid'}
          onChange={(e) => {
            const v = e.target.value === 'dashed';
            setDash(v);
            if (selected?.kind === 'link') setDiagram((d) => ({ ...d, links: d.links.map((l) => (l.id === selected.id ? { ...l, dash: v } : l)) }));
          }}
          className="rounded-md border border-[#1d444c] bg-[#0f2b31] px-1.5 py-1 text-[12px]"
        >
          <option value="solid">실선</option>
          <option value="dashed">점선</option>
        </select>
        <select
          value={route}
          onChange={(event) => setRoute(event.target.value as typeof route)}
          className="rounded-md border border-[#1d444c] bg-[#0f2b31] px-1.5 py-1 text-[12px]"
          title="연결선 경로"
        >
          <option value="ORTHOGONAL">직각 자동선</option>
          <option value="CURVED">곡선</option>
          <option value="STRAIGHT">직선</option>
        </select>
        <button onClick={autoArrange} className="flex items-center gap-1 rounded-md border border-[#1d444c] bg-[#0f2b31] px-2.5 py-1.5 text-[12px] hover:border-[#35e0c8] hover:text-[#35e0c8]">
          <WandSparkles className="h-3.5 w-3.5" /> 자동 정렬
        </button>
        <div className="h-5 w-px bg-[#1d444c]" />
        <button
          onClick={() => {
            if (selected?.kind !== 'zone') return;
            setEditingZone(diagram.zones.find((zone) => zone.id === selected.id) ?? null);
          }}
          disabled={selected?.kind !== 'zone'}
          className="flex items-center gap-1 rounded-md border border-[#1d444c] bg-[#0f2b31] px-2.5 py-1.5 text-[12px] hover:border-[#35e0c8] hover:text-[#35e0c8] disabled:opacity-40"
        >
          <Pencil className="h-3.5 w-3.5" /> 구역명 수정
        </button>
        <button onClick={deleteSelected} disabled={!selected} className="flex items-center gap-1 rounded-md border border-[#1d444c] bg-[#0f2b31] px-2.5 py-1.5 text-[12px] hover:border-[#ff5f7a] hover:text-[#ff5f7a] disabled:opacity-40">
          <Trash2 className="h-3.5 w-3.5" /> 삭제
        </button>
        <button
          onClick={() => { if (confirm('구성도 전체를 지울까요?')) { setDiagram(EMPTY_DIAGRAM); setSelected(null); } }}
          className="rounded-md border border-[#1d444c] bg-[#0f2b31] px-2.5 py-1.5 text-[12px] hover:border-[#ff5f7a] hover:text-[#ff5f7a]"
        >
          전체 지우기
        </button>
        <Button size="sm" className="ml-auto" disabled={saveMutation.isPending || companyId == null} onClick={() => saveMutation.mutate()}>
          <Save className="mr-1 h-3.5 w-3.5" /> {saveMutation.isPending ? '저장 중...' : '저장'}
        </Button>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* 팔레트 */}
        <aside className="w-[286px] shrink-0 overflow-y-auto border-r border-[#1d444c] bg-[#091b20] p-3">
          <div className="mb-3 rounded-xl border border-[#1d444c] bg-[#0d252b] p-2.5 shadow-lg shadow-black/20">
            <div className="mb-2 flex items-center gap-2">
              <CircleDot className="h-4 w-4 text-[#35e0c8]" />
              <span className="text-xs font-bold text-[#d8f3ef]">실제 등록 장비</span>
              <span className="ml-auto rounded-full bg-[#35e0c8]/10 px-2 py-0.5 text-[10px] text-[#35e0c8]">{devices.length}</span>
            </div>
            <div className="mb-2 flex items-center gap-2 rounded-lg border border-[#244b53] bg-[#071518] px-2.5 py-2">
              <Search className="h-3.5 w-3.5 text-[#6fa3a0]" />
              <input value={deviceSearch} onChange={(event) => setDeviceSearch(event.target.value)} placeholder="장비명·호스트·모델 검색" className="min-w-0 flex-1 bg-transparent text-[11px] outline-none placeholder:text-[#496c6c]" />
            </div>
            <div className="max-h-[310px] space-y-1 overflow-y-auto pr-1">
              {devices
                .filter((device) => `${device.deviceName} ${device.hostName ?? ''} ${device.modelName ?? ''} ${device.deviceType ?? ''}`.toLowerCase().includes(deviceSearch.trim().toLowerCase()))
                .slice(0, 80)
                .map((device) => {
                  const type = nodeTypeForDevice(device);
                  const Icon = NODE_ICON[type];
                  const placed = diagram.nodes.some((node) => node.deviceId === device.id);
                  return (
                    <button key={device.id} onClick={() => addDeviceNode(device)} className={cn('flex w-full items-center gap-2 rounded-lg border px-2 py-2 text-left transition-colors', placed ? 'border-[#244b53] bg-[#071518] opacity-55' : 'border-transparent bg-[#102a30] hover:border-[#35e0c8]/60 hover:bg-[#12343b]')}>
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#35e0c8]/10 text-[#8ee9dc]"><Icon className="h-4.5 w-4.5" /></span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[11px] font-semibold text-[#d8f3ef]">{device.deviceName}</span>
                        <span className="block truncate text-[9px] text-[#6fa3a0]">{[device.hostName, device.modelName].filter(Boolean).join(' · ') || device.deviceType || '장비'}</span>
                      </span>
                      <span className={cn('h-2 w-2 shrink-0 rounded-full', /DOWN|ERROR|FAULT|CRITICAL/i.test(device.status ?? '') ? 'bg-[#ff5f7a] shadow-[0_0_7px_#ff5f7a]' : 'bg-[#35e0c8]')} />
                    </button>
                  );
                })}
            </div>
          </div>
          <div className="mb-2 flex items-center gap-2 px-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#6fa3a0]">
            <span className="h-px flex-1 bg-[#1d444c]" /> 논리 노드 <span className="h-px flex-1 bg-[#1d444c]" />
          </div>
          {PALETTE.map((g) => (
            <div key={g.group} className="mb-3">
              <div className="mb-1.5 text-[11px] tracking-wide text-[#6fa3a0]">{g.group}</div>
              {g.items.map((it) => {
                const Icon = NODE_ICON[it.type];
                return (
                  <button
                    key={it.type}
                    onClick={() => { const c = screenCenter(); addNode(it.type, it.label, c.x + (Math.random() * 60 - 30), c.y + (Math.random() * 60 - 30)); }}
                    className="flex w-full items-center gap-2 rounded-lg px-1.5 py-1.5 text-left text-[12px] hover:bg-[#0f2b31]"
                  >
                    <Icon className="h-6 w-6 shrink-0 text-[#9adfd6]" strokeWidth={1.5} />
                    <span>{it.label}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </aside>

        {/* 캔버스 */}
        <div className="relative flex-1">
          {isLoading ? (
            <div className="flex h-full items-center justify-center text-sm text-[#6fa3a0]">불러오는 중...</div>
          ) : (
            <svg
              ref={svgRef}
              className="block h-full w-full touch-none"
              style={{ cursor: mode === 'select' ? 'default' : 'crosshair' }}
              onPointerDown={handlePointerDownSvg}
              onPointerMove={handlePointerMoveSvg}
              onPointerUp={handlePointerUpSvg}
              onWheel={handleWheel}
              onDoubleClick={(e) => {
                const nodeEl = (e.target as SVGElement).closest('[data-node-id]');
                const zoneEl = (e.target as SVGElement).closest('[data-zone-id]');
                if (nodeEl) setEditingNode(diagram.nodes.find((n) => n.id === nodeEl.getAttribute('data-node-id')) ?? null);
                else if (zoneEl) setEditingZone(diagram.zones.find((zone) => zone.id === zoneEl.getAttribute('data-zone-id')) ?? null);
              }}
            >
              <defs>
                <pattern id="grid" width="28" height="28" patternUnits="userSpaceOnUse">
                  <path d="M28 0H0V28" fill="none" stroke="#0d262c" strokeWidth="1" />
                </pattern>
              </defs>
              <rect x={-5000} y={-5000} width={10000} height={10000} fill="url(#grid)" />
              <g transform={`translate(${view.x},${view.y}) scale(${view.k})`}>
                {diagram.zones.map((z) => (
                  <g key={z.id} data-zone-id={z.id}>
                    <rect
                      x={z.x} y={z.y} width={z.w} height={z.h} rx={10}
                      fill={z.color + '18'} stroke={z.color} strokeWidth={selected?.kind === 'zone' && selected.id === z.id ? 2.5 : 1.5}
                      strokeDasharray="6 4"
                    />
                    <rect
                      x={z.x + 8} y={z.y - 11} width={Math.max(40, z.label.length * 13 + 16)} height={22} rx={11} fill={z.color}
                      style={{ cursor: 'text' }}
                      onDoubleClick={(event) => { event.stopPropagation(); setEditingZone(z); }}
                    />
                    <text
                      x={z.x + 8 + Math.max(40, z.label.length * 13 + 16) / 2} y={z.y + 4} textAnchor="middle" fontSize={12} fontWeight={700} fill="#04211d"
                      style={{ cursor: 'text', userSelect: 'none' }}
                      onDoubleClick={(event) => { event.stopPropagation(); setEditingZone(z); }}
                    >{z.label}</text>
                    <rect data-zone-handle x={z.x + z.w - 10} y={z.y + z.h - 10} width={12} height={12} fill={z.color} rx={3} style={{ cursor: 'nwse-resize' }} />
                  </g>
                ))}

                {diagram.links.map((l) => {
                  const a = diagram.nodes.find((n) => n.id === l.a);
                  const b = diagram.nodes.find((n) => n.id === l.b);
                  if (!a || !b) return null;
                  const isSel = selected?.kind === 'link' && selected.id === l.id;
                  const linkRoute = l.route ?? 'ORTHOGONAL';
                  const middleX = (a.x + b.x) / 2;
                  const middleY = (a.y + b.y) / 2;
                  const path = linkRoute === 'STRAIGHT'
                    ? `M ${a.x} ${a.y} L ${b.x} ${b.y}`
                    : linkRoute === 'CURVED'
                      ? `M ${a.x} ${a.y} C ${middleX} ${a.y}, ${middleX} ${b.y}, ${b.x} ${b.y}`
                      : `M ${a.x} ${a.y} H ${middleX} V ${b.y} H ${b.x}`;
                  return (
                    <g key={l.id} data-link-id={l.id} style={{ filter: `drop-shadow(0 0 ${isSel ? 5 : 2}px ${l.color})` }}>
                      <path d={path} fill="none" stroke="transparent" strokeWidth={18} />
                      <path d={path} fill="none" stroke="#031014" strokeWidth={isSel ? 7 : 6} strokeLinecap="round" strokeLinejoin="round" />
                      <path d={path} fill="none" stroke={l.color} strokeWidth={isSel ? 4.5 : 3.5} strokeDasharray={l.dash ? '9 6' : undefined} strokeLinecap="round" strokeLinejoin="round" />
                      {(l.sourcePortName || l.destPortName) && (
                        <g transform={`translate(${middleX},${middleY})`}>
                          <rect x={-58} y={-10} width={116} height={20} rx={10} fill="#071518" stroke={l.color} strokeOpacity={0.7} />
                          <text textAnchor="middle" y={4} fill="#d8f3ef" fontSize={8.5}>{`${l.sourcePortName ?? 'AUTO'} → ${l.destPortName ?? 'AUTO'}`}</text>
                        </g>
                      )}
                    </g>
                  );
                })}

                {connectFrom && (() => {
                  const a = diagram.nodes.find((n) => n.id === connectFrom);
                  return a ? (
                    <g className="pointer-events-none">
                      {connectPointer && <line x1={a.x} y1={a.y} x2={connectPointer.x} y2={connectPointer.y} stroke={lineColor} strokeWidth={3.5} strokeDasharray="8 6" strokeLinecap="round" style={{ filter: `drop-shadow(0 0 3px ${lineColor})` }} />}
                      <circle cx={a.x} cy={a.y} r={NODE_W / 2 + 5} fill={lineColor + '18'} stroke={lineColor} strokeWidth={2.5} strokeDasharray="6 4" />
                    </g>
                  ) : null;
                })()}

                {diagram.nodes.map((n) => {
                  const Icon = NODE_ICON[n.type];
                  const isSel = selected?.kind === 'node' && selected.id === n.id;
                  const alarmed = /DOWN|ERROR|FAULT|CRITICAL/i.test(n.status ?? '');
                  return (
                    <g key={n.id} data-node-id={n.id} transform={`translate(${n.x - NODE_W / 2},${n.y - NODE_H / 2})`} style={{ cursor: 'move' }}>
                      <rect
                        width={NODE_W} height={NODE_H} rx={10}
                        fill="#0a2026" stroke={alarmed ? '#ff5f7a' : isSel ? '#ffb03a' : '#2a5c63'} strokeWidth={isSel || alarmed ? 2.5 : 1.5}
                        style={{ filter: 'drop-shadow(0 3px 6px rgba(0,0,0,.5))' }}
                      />
                      <rect x={1} y={1} width={NODE_W - 2} height={25} rx={9} fill={alarmed ? '#421821' : '#0f3036'} />
                      <Icon x={9} y={7} width={14} height={14} color={alarmed ? '#ff8da0' : '#8ee9dc'} strokeWidth={1.8} />
                      <text x={29} y={18} fontSize={11} fontWeight={700} fill="#edfdfb">{n.label.length > 20 ? `${n.label.slice(0, 19)}…` : n.label}</text>
                      <circle cx={NODE_W - 12} cy={13} r={4} fill={alarmed ? '#ff5f7a' : '#35e0c8'} style={{ filter: `drop-shadow(0 0 4px ${alarmed ? '#ff5f7a' : '#35e0c8'})` }} />
                      <text x={10} y={43} fontSize={9} fill="#7fb5b0">{n.hostName || n.modelName || n.type.toUpperCase()}</text>
                      <text x={10} y={59} fontSize={9} fill="#a8cbc7">{n.managementIp || (n.deviceId != null ? `ASSET #${n.deviceId}` : 'LOGICAL NODE')}</text>
                      <rect x={10} y={66} width={58} height={10} rx={5} fill="#13363d" />
                      <text x={39} y={74} textAnchor="middle" fontSize={7} fill="#6fa3a0">{n.type.toUpperCase()}</text>
                      {mode === 'connect' && <>
                        <circle cx={0} cy={NODE_H / 2} r={7} fill={connectFrom === n.id ? lineColor : '#d8f3ef'} stroke="#071518" strokeWidth={2} />
                        <circle cx={NODE_W} cy={NODE_H / 2} r={7} fill={connectFrom === n.id ? lineColor : '#d8f3ef'} stroke="#071518" strokeWidth={2} />
                      </>}
                    </g>
                  );
                })}
              </g>
            </svg>
          )}
          <div className="pointer-events-none absolute bottom-3 left-3 max-w-[70%] rounded-md border border-[#1d444c] bg-[#071518]/80 px-2.5 py-1.5 text-[11px] text-[#6fa3a0]">
            팔레트 클릭: 장비 추가 · 더블클릭: 이름/연결 장비 지정 · 휠: 확대·축소 · 빈 곳 드래그: 화면 이동
          </div>
        </div>
      </div>

      <NodeEditDialog
        node={editingNode}
        devices={devices}
        onClose={() => setEditingNode(null)}
        onSave={(patch) => {
          setDiagram((d) => ({ ...d, nodes: d.nodes.map((n) => (n.id === editingNode!.id ? { ...n, ...patch } : n)) }));
          setEditingNode(null);
        }}
      />
      <ZoneEditDialog
        zone={editingZone}
        onClose={() => setEditingZone(null)}
        onSave={(patch) => {
          setDiagram((current) => ({
            ...current,
            zones: current.zones.map((zone) => zone.id === editingZone!.id ? { ...zone, ...patch } : zone),
          }));
          setLineColor(patch.color);
          setEditingZone(null);
        }}
      />
      <LinkCreateDialog
        key={pendingLink ? `${pendingLink.sourceNodeId}-${pendingLink.destNodeId}` : 'closed'}
        pending={pendingLink}
        nodes={diagram.nodes}
        devices={devices}
        defaultColor={lineColor}
        defaultDash={dash}
        defaultRoute={route}
        onClose={() => setPendingLink(null)}
        onSave={(link) => {
          setDiagram((current) => ({ ...current, links: [...current.links, { id: uid('l'), ...link }] }));
          setPendingLink(null);
          setMode('select');
        }}
      />
    </div>
  );
}

function LinkCreateDialog({ pending, nodes, devices, defaultColor, defaultDash, defaultRoute, onClose, onSave }: {
  pending: PendingLink | null;
  nodes: DiagramNode[];
  devices: ApiDevice[];
  defaultColor: string;
  defaultDash: boolean;
  defaultRoute: 'ORTHOGONAL' | 'CURVED' | 'STRAIGHT';
  onClose: () => void;
  onSave: (link: Omit<DiagramLink, 'id'>) => void;
}) {
  const [sourcePortId, setSourcePortId] = useState('');
  const [destPortId, setDestPortId] = useState('');
  const [cableType, setCableType] = useState('UTP');
  if (!pending) return null;
  const sourceNode = nodes.find((node) => node.id === pending.sourceNodeId);
  const destNode = nodes.find((node) => node.id === pending.destNodeId);
  if (!sourceNode || !destNode) return null;
  const sourceDevice = devices.find((device) => device.id === sourceNode.deviceId);
  const destDevice = devices.find((device) => device.id === destNode.deviceId);
  const sourcePorts = sourceDevice?.ports ?? [];
  const destPorts = destDevice?.ports ?? [];
  const portLabel = (port: ApiPort) => port.portName || port.deviceNetworkName || port.connectionAddress || `PORT-${port.id}`;
  const sourcePort = sourcePorts.find((port) => String(port.id) === sourcePortId);
  const destPort = destPorts.find((port) => String(port.id) === destPortId);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader><DialogTitle>장비 포트 연결</DialogTitle></DialogHeader>
        <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-3">
          <div className="rounded-lg border bg-muted/20 p-3">
            <p className="mb-2 text-xs font-semibold">{sourceNode.label}</p>
            <Label className="text-[11px]">출발 포트</Label>
            <select value={sourcePortId} onChange={(event) => setSourcePortId(event.target.value)} className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-xs">
              <option value="">자동/미지정</option>
              {sourcePorts.map((port) => <option key={port.id} value={port.id}>{portLabel(port)}</option>)}
            </select>
          </div>
          <Cable className="mt-9 h-5 w-5 text-muted-foreground" />
          <div className="rounded-lg border bg-muted/20 p-3">
            <p className="mb-2 text-xs font-semibold">{destNode.label}</p>
            <Label className="text-[11px]">도착 포트</Label>
            <select value={destPortId} onChange={(event) => setDestPortId(event.target.value)} className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-xs">
              <option value="">자동/미지정</option>
              {destPorts.map((port) => <option key={port.id} value={port.id}>{portLabel(port)}</option>)}
            </select>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>케이블 종류</Label>
          <select value={cableType} onChange={(event) => setCableType(event.target.value)} className="h-9 w-full rounded-md border bg-background px-2 text-sm">
            <option value="UTP">UTP</option><option value="FIBER">광케이블</option><option value="DAC">DAC</option><option value="WAN">전용선/WAN</option><option value="VIRTUAL">가상 연결</option>
          </select>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>취소</Button>
          <Button onClick={() => onSave({ a: sourceNode.id, b: destNode.id, color: defaultColor, dash: defaultDash, sourcePortId: sourcePort?.id ?? null, sourcePortName: sourcePort ? portLabel(sourcePort) : 'AUTO', destPortId: destPort?.id ?? null, destPortName: destPort ? portLabel(destPort) : 'AUTO', cableType, route: defaultRoute })}>연결</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ToolBtn({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: LucideIcon; label: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[12px] transition-colors',
        active ? 'border-[#35e0c8] bg-[#35e0c8] font-bold text-[#04211d]' : 'border-[#1d444c] bg-[#0f2b31] text-[#d8f3ef] hover:border-[#35e0c8] hover:text-[#35e0c8]',
      )}
    >
      <Icon className="h-3.5 w-3.5" /> {label}
    </button>
  );
}

function ZoneEditDialog({
  zone,
  onClose,
  onSave,
}: {
  zone: DiagramZone | null;
  onClose: () => void;
  onSave: (patch: { label: string; color: string }) => void;
}) {
  const [label, setLabel] = useState('');
  const [color, setColor] = useState(LINE_COLORS[0]);

  useEffect(() => {
    if (!zone) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLabel(zone.label);
    setColor(zone.color);
  }, [zone]);

  return (
    <Dialog open={!!zone} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>구역 라벨 편집</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="zone-label">구역 이름</Label>
            <Input id="zone-label" value={label} onChange={(event) => setLabel(event.target.value)} autoFocus maxLength={40} onKeyDown={(event) => { if (event.key === 'Enter' && label.trim()) onSave({ label: label.trim(), color }); }} />
          </div>
          <div className="space-y-2">
            <Label>구역 색상</Label>
            <div className="flex flex-wrap gap-2">
              {LINE_COLORS.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setColor(item)}
                  className={cn('h-8 w-8 rounded-full border-2 transition-transform hover:scale-110', color === item ? 'scale-110 border-foreground' : 'border-transparent')}
                  style={{ backgroundColor: item }}
                  aria-label={`구역 색상 ${item}`}
                />
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>취소</Button>
          <Button disabled={!label.trim()} onClick={() => onSave({ label: label.trim(), color })}>저장</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NodeEditDialog({
  node, devices, onClose, onSave,
}: {
  node: DiagramNode | null;
  devices: ApiDevice[];
  onClose: () => void;
  onSave: (patch: { label: string; deviceId: number | null }) => void;
}) {
  const [label, setLabel] = useState('');
  const [deviceId, setDeviceId] = useState<string>('');

  useEffect(() => {
    if (!node) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLabel(node.label);
    setDeviceId(node.deviceId != null ? String(node.deviceId) : '');
  }, [node]);

  return (
    <Dialog open={!!node} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>장비 편집</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>이름</Label>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>연결 장비 (선택 — 지정 시 해당 장비의 장애 알람이 이 노드에 표시됩니다)</Label>
            <select value={deviceId} onChange={(e) => setDeviceId(e.target.value)} className="h-9 w-full rounded-md border bg-transparent px-2.5 text-[13px] outline-none">
              <option value="">연결 안 함</option>
              {devices.map((d) => (
                <option key={d.id} value={d.id}>{d.deviceName}</option>
              ))}
            </select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>취소</Button>
          <Button onClick={() => onSave({ label: label.trim() || node!.label, deviceId: deviceId ? Number(deviceId) : null })}>저장</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
