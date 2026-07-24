'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import type { DiagramZone } from '@/lib/networkDiagram';
import { LINE_COLORS } from './types';

export function ZoneEditDialog({
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
