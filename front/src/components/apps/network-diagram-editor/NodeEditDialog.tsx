'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { DiagramNode } from '@/lib/networkDiagram';
import { ApiDevice } from './types';

export function NodeEditDialog({
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
