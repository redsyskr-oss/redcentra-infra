'use client';

import { useState } from 'react';
import { Cable } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import type { DiagramLink, DiagramNode } from '@/lib/networkDiagram';
import { ApiDevice, ApiPort, PendingLink } from './types';

export function LinkCreateDialog({ pending, nodes, devices, defaultColor, defaultDash, defaultRoute, onClose, onSave }: {
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
