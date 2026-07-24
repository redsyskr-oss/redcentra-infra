'use client';

import { useMemo, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Download, FileSpreadsheet, Plus, Trash2, Pencil, Server as ServerIcon, Upload } from 'lucide-react';
import * as XLSX from 'xlsx-js-style';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { apiFetch } from '@/lib/api';

/**
 * 랙 상세 · 실장도 — UI-RACK-001
 * 범위 축소: 3D 정면/후면 뷰 · 웹 CLI(UI-RACK-001 개정)는 이번 목업에서 제외하고
 * 2D U-슬롯 리스트 + 배치/해제 모달로 단순화했다.
 */
interface RackDevice {
  id: number;
  deviceName: string;
  deviceType: string;
  modelName: string;
  status: string;
  uPosition: number;
  uSize: number;
  assetNo?: string;
  hostName?: string;
  serialNumber?: string;
  introDate?: string;
  productModelId?: number | null;
  ports?: { type: string; deviceNetworkName: string; portRole?: string }[];
  cableLinks?: {
    srcDeviceId: number;
    srcPortName: string;
    destDeviceId: number;
    destPortName: string;
  }[];
}

interface Rack {
  id: number;
  roomId: number;
  rackName: string;
  posX: number;
  posY: number;
  totalUnit: number;
  installedAt: string;
  devices: RackDevice[];
}

interface Room {
  id: number;
  roomName: string;
}

interface UnrackedDevice {
  id: number;
  deviceName: string;
  deviceType: string;
  modelName: string;
  uSize: number;
  lifecycleStatus?: 'RECEIVED' | 'INSPECTION_PASSED' | 'INSTALLED';
  productModelId?: number | null;
  cpuSocketCount?: number | null;
  totalCoreCount?: number | null;
  memoryGb?: number | null;
}

interface PortTemplate {
  id: number;
  productModelId: number;
  portPrefix: string;
  startIndex: number;
  endIndex: number;
  indexStep: number;
  zeroPadding: number;
  portType: string;
  portRole: string;
}

interface SoftwareLicense {
  id: number;
  swName: string;
  version: string;
  category: 'OS' | 'SOFTWARE';
  purchasedQty: number;
  assignUnit: 'NODE' | 'AGENT' | 'PROCESSOR' | 'CORE';
  corePackSize?: number;
}

interface LicenseAssignment {
  id: number;
  licenseId: number;
  deviceId: number | null;
  revokedAt: string | null;
  assignedQty?: number;
}

interface PlacementInput {
  deviceId: number;
  rackId: number;
  uPosition: number;
  licenses: { licenseId: number; assignedQty: number }[];
  ports: { type: string; deviceNetworkName: string; portRole: string }[];
  cableLink?: {
    cableType: string;
    srcDeviceId: number;
    srcDeviceName: string;
    srcPortName: string;
    destDeviceId: number;
    destDeviceName: string;
    destPortName: string;
    memo: string;
  };
}

interface Backup {
  id: number;
  deviceId: number;
  backupType: string;
  backupSystem: string;
}

const TABS = [
  { id: 'devices', label: '실장 장비' },
  { id: 'backup', label: '백업 현황' },
  { id: 'info', label: '기본 정보' },
] as const;
type TabId = (typeof TABS)[number]['id'];

export default function RackManage({ data }: { data?: unknown }) {
  const queryClient = useQueryClient();
  const [selectedRackId, setSelectedRackId] = useState<number | null>(null);
  const [tab, setTab] = useState<TabId>('devices');
  const [assignOpen, setAssignOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const { data: racks = [], isLoading } = useQuery<Rack[]>({
    queryKey: ['racks'],
    queryFn: async () => {
      const [rackRes, deviceRes] = await Promise.all([apiFetch('/api/v1/racks'), apiFetch('/api/v1/devices')]);
      if (!rackRes.ok) return [];
      const rackRows: Rack[] = await rackRes.json();
      // 랙 레코드에는 devices가 없다(단일 소스: devices 컬렉션). 조회 실패 시에도 빈 배열을 보장한다.
      if (!deviceRes.ok) return rackRows.map((rack) => ({ ...rack, devices: [] }));
      const deviceRows: (RackDevice & { rackId: number | null })[] = await deviceRes.json();
      return rackRows.map((rack) => ({
        ...rack,
        devices: deviceRows.filter((device) => Number(device.rackId) === Number(rack.id)),
      }));
    },
  });

  const { data: rooms = [] } = useQuery<Room[]>({
    queryKey: ['rooms-flat'],
    queryFn: async () => {
      const res = await apiFetch('/api/v1/rooms?page=1&size=100');
      if (!res.ok) return [];
      const json = await res.json();
      return json.content ?? [];
    },
  });

  const { data: unracked = [] } = useQuery<UnrackedDevice[]>({
    queryKey: ['devices-unracked'],
    queryFn: async () => {
      const res = await apiFetch('/api/v1/devices');
      if (!res.ok) return [];
      const all: (UnrackedDevice & { rackId: number | null })[] = await res.json();
      return all.filter((d) => d.rackId === null && d.lifecycleStatus !== 'RECEIVED');
    },
  });

  const { data: backups = [] } = useQuery<Backup[]>({
    queryKey: ['backups-flat'],
    queryFn: async () => {
      const res = await apiFetch('/api/v1/backups');
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: portTemplates = [] } = useQuery<PortTemplate[]>({
    queryKey: ['portTemplates'],
    queryFn: async () => {
      const res = await apiFetch('/api/v1/portTemplates');
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: softwareLicenses = [] } = useQuery<SoftwareLicense[]>({
    queryKey: ['swLicenses'],
    queryFn: async () => {
      const res = await apiFetch('/api/v1/swLicenses');
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: licenseAssignments = [] } = useQuery<LicenseAssignment[]>({
    queryKey: ['licenseAssignments'],
    queryFn: async () => {
      const res = await apiFetch('/api/v1/licenseAssignments');
      if (!res.ok) return [];
      return res.json();
    },
  });

  const roomNameById = useMemo(() => new Map(rooms.map((r) => [r.id, r.roomName])), [rooms]);
  const selectedRack = racks.find((r) => r.id === selectedRackId) ?? null;

  const assignMutation = useMutation({
    mutationFn: async (placement: PlacementInput) => {
      const res = await apiFetch(`/api/v1/devices/${placement.deviceId}/placement`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rackId: placement.rackId,
          uPosition: placement.uPosition,
          lifecycleStatus: 'INSTALLED',
          installedAt: new Date().toISOString(),
          status: 'OPERATING',
          ports: placement.ports,
          cableLinks: placement.cableLink ? [placement.cableLink] : [],
        }),
      });
      if (!res.ok) throw new Error('장비 배치에 실패했습니다.');
      const device = await res.json();
      for (const license of placement.licenses) {
        const licenseRes = await apiFetch('/api/v1/licenseAssignments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            licenseId: license.licenseId,
            deviceId: placement.deviceId,
            memberId: null,
            assignedAt: new Date().toISOString(),
            revokedAt: null,
            assignedQty: license.assignedQty,
            appliedCoreCount: softwareLicenses.find((item) => item.id === license.licenseId)?.assignUnit === 'CORE' ? license.assignedQty : null,
            licenseUnitQty: softwareLicenses.find((item) => item.id === license.licenseId)?.assignUnit === 'CORE'
              ? license.assignedQty / Math.max(1, softwareLicenses.find((item) => item.id === license.licenseId)?.corePackSize ?? 1)
              : license.assignedQty,
          }),
        });
        if (!licenseRes.ok) throw new Error('장비는 배치되었지만 일부 소프트웨어 라이선스 할당에 실패했습니다.');
      }
      return device;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['racks'] });
      queryClient.invalidateQueries({ queryKey: ['devices-unracked'] });
      queryClient.invalidateQueries({ queryKey: ['devices'] });
      queryClient.invalidateQueries({ queryKey: ['licenseAssignments'] });
      queryClient.invalidateQueries({ queryKey: ['room'] });
      queryClient.invalidateQueries({ queryKey: ['rack-detail'] });
      setAssignOpen(false);
    },
  });

  const unassignMutation = useMutation({
    mutationFn: async (deviceId: number) => {
      const res = await apiFetch(`/api/v1/devices/${deviceId}/placement`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rackId: null, uPosition: null, lifecycleStatus: 'INSPECTION_PASSED', installedAt: null, status: 'STANDBY' }),
      });
      if (!res.ok) throw new Error('장비 해제에 실패했습니다.');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['racks'] });
      queryClient.invalidateQueries({ queryKey: ['devices-unracked'] });
      queryClient.invalidateQueries({ queryKey: ['devices'] });
      queryClient.invalidateQueries({ queryKey: ['room'] });
      queryClient.invalidateQueries({ queryKey: ['rack-detail'] });
    },
  });

  const editMutation = useMutation({
    mutationFn: async (patch: Partial<Rack>) => {
      const res = await apiFetch(`/api/v1/racks/${selectedRackId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error('랙 정보 수정에 실패했습니다.');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['racks'] });
      setEditOpen(false);
    },
  });

  return (
    <div className="flex h-full">
      {/* 좌측: 랙 목록 */}
      <div className="w-56 shrink-0 border-r flex flex-col">
        <div className="px-3 py-2 text-xs font-medium text-muted-foreground border-b">
          랙 목록 ({racks.length})
        </div>
        <ScrollArea className="flex-1">
          {isLoading ? (
            <div className="p-3 text-sm text-muted-foreground">불러오는 중...</div>
          ) : (
            racks.map((rack) => {
              const used = rack.devices.reduce((sum, d) => sum + d.uSize, 0);
              return (
                <button
                  key={rack.id}
                  onClick={() => { setSelectedRackId(rack.id); setTab('devices'); }}
                  className={cn(
                    'w-full flex flex-col items-start gap-0.5 px-3 py-2 text-left border-b hover:bg-accent transition-colors',
                    selectedRackId === rack.id && 'bg-accent',
                  )}
                >
                  <span className="text-sm font-medium">{rack.rackName}</span>
                  <span className="text-[11px] text-muted-foreground">
                    {roomNameById.get(rack.roomId) ?? ''} · {used}/{rack.totalUnit}U
                  </span>
                </button>
              );
            })
          )}
        </ScrollArea>
      </div>

      {/* 우측: 상세 */}
      <div className="flex-1 flex flex-col min-w-0">
        {!selectedRack ? (
          <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
            좌측에서 랙을 선택하세요.
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between border-b px-4 py-2">
              <div>
                <div className="font-semibold">{selectedRack.rackName}</div>
                <div className="text-xs text-muted-foreground">
                  {roomNameById.get(selectedRack.roomId)} · 총 {selectedRack.totalUnit}U
                </div>
                <div className="mt-1 text-[11px] text-blue-700">검수완료·미실장 장비 {unracked.length}대 배치 가능</div>
              </div>
              <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => downloadRackExcel(selectedRack)}><Download className="mr-1 h-4 w-4" />실장도 다운로드</Button>
              <Button size="sm" variant="outline" onClick={() => downloadRackTemplate(selectedRack)}><FileSpreadsheet className="mr-1 h-4 w-4" />업로드 템플릿</Button>
              <Button size="sm" variant="outline" onClick={() => setImportOpen(true)}><Upload className="mr-1 h-4 w-4" />엑셀 업로드</Button>
              <Button size="sm" onClick={() => setAssignOpen(true)}>
                <Plus className="mr-1 h-4 w-4" /> 검수완료 장비 배치
              </Button>
              </div>
            </div>

            <div className="flex gap-1 border-b px-3 pt-2">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={cn(
                    '-mb-px rounded-t-md border px-3 py-1.5 text-sm transition-colors',
                    tab === t.id
                      ? 'border-border border-b-background bg-background font-medium'
                      : 'border-transparent text-muted-foreground hover:text-foreground',
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <ScrollArea className="flex-1">
              {tab === 'devices' && (
                <div className="p-3 space-y-1">
                  {Array.from({ length: selectedRack.totalUnit }, (_, i) => selectedRack.totalUnit - i).map((u) => {
                    const device = selectedRack.devices.find(
                      (d) => u >= d.uPosition && u < d.uPosition + d.uSize,
                    );
                    const isStart = device?.uPosition === u;
                    if (device && !isStart) return null;
                    return (
                      <div
                        key={u}
                        className={cn(
                          'flex items-center gap-2 rounded border px-2 py-1.5 text-xs',
                          device ? 'bg-blue-500/10 border-blue-500/30' : 'border-dashed text-muted-foreground',
                        )}
                        style={device ? { minHeight: `${device.uSize * 28}px` } : undefined}
                      >
                        <span className="w-8 shrink-0 font-mono">{u}U</span>
                        {device ? (
                          <>
                            <ServerIcon className="h-3.5 w-3.5 shrink-0 text-blue-500" />
                            <span className="font-medium">{device.deviceName}</span>
                            <span className="text-muted-foreground">{device.modelName}</span>
                            <span className="ml-auto text-muted-foreground">{device.uSize}U</span>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-6 w-6"
                              onClick={() => unassignMutation.mutate(device.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        ) : (
                          <span>비어있음</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {tab === 'backup' && (
                <div className="p-3 space-y-1.5">
                  {selectedRack.devices.length === 0 ? (
                    <div className="text-sm text-muted-foreground">실장된 장비가 없습니다.</div>
                  ) : (
                    selectedRack.devices.map((d) => {
                      const backup = backups.find((b) => b.deviceId === d.id);
                      return (
                        <div key={d.id} className="flex items-center justify-between rounded border px-3 py-2 text-sm">
                          <span className="font-medium">{d.deviceName}</span>
                          {backup ? (
                            <span className="text-emerald-600 text-xs">{backup.backupSystem} · {backup.backupType}</span>
                          ) : (
                            <span className="text-amber-500 text-xs">미등록</span>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              )}

              {tab === 'info' && (
                <div className="p-4 space-y-3 max-w-sm text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">랙 명칭</span><span>{selectedRack.rackName}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">위치</span><span>{roomNameById.get(selectedRack.roomId)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">총 유닛</span><span>{selectedRack.totalUnit}U</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">좌표</span><span>({selectedRack.posX}, {selectedRack.posY})</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">설치일</span><span>{selectedRack.installedAt}</span></div>
                  <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>
                    <Pencil className="mr-1 h-3.5 w-3.5" /> 수정
                  </Button>
                </div>
              )}
            </ScrollArea>
          </>
        )}
      </div>

      {/* 장비 배치 모달 */}
      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>검수완료 장비 랙 배치</DialogTitle>
            <DialogDescription>IT 자산 목록에서 검수 완료 승인된 미실장 장비만 표시됩니다. 랙과 시작 U를 지정하면 실장완료로 변경됩니다.</DialogDescription>
          </DialogHeader>
          <AssignForm
            unracked={unracked}
            racks={racks}
            rooms={rooms}
            initialRackId={selectedRack?.id ?? null}
            portTemplates={portTemplates}
            licenses={softwareLicenses}
            licenseAssignments={licenseAssignments}
            onSubmit={(placement) => assignMutation.mutate(placement)}
            pending={assignMutation.isPending}
          />
        </DialogContent>
      </Dialog>

      {/* 기본 정보 수정 모달 */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>랙 정보 수정</DialogTitle>
          </DialogHeader>
          {selectedRack && (
            <EditForm
              rack={selectedRack}
              onSubmit={(patch) => editMutation.mutate(patch)}
              pending={editMutation.isPending}
            />
          )}
        </DialogContent>
      </Dialog>
      {selectedRack && <RackExcelImportDialog open={importOpen} onOpenChange={setImportOpen} rack={selectedRack} onSuccess={() => { queryClient.invalidateQueries({ queryKey: ['racks'] }); queryClient.invalidateQueries({ queryKey: ['devices-unracked'] }); }} />}
    </div>
  );
}

const IMPORT_HEADERS = ['장비명', '자산번호', '장비유형', '모델명', '호스트명', '시리얼번호', '도입일', '시작U', '사용U', '상태'];

function writeWorkbook(rows: (string | number)[][], fileName: string) {
  const sheet = XLSX.utils.aoa_to_sheet([IMPORT_HEADERS, ...rows]);
  sheet['!cols'] = [{ wch: 24 }, { wch: 16 }, { wch: 14 }, { wch: 22 }, { wch: 24 }, { wch: 18 }, { wch: 13 }, { wch: 10 }, { wch: 10 }, { wch: 12 }];
  const book = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(book, sheet, '랙 실장도'); XLSX.writeFile(book, `${fileName}.xlsx`);
}

function downloadRackExcel(rack: Rack) {
  writeWorkbook([...rack.devices].sort((a, b) => b.uPosition - a.uPosition).map((device) => [device.deviceName, device.assetNo ?? '', device.deviceType, device.modelName ?? '', device.hostName ?? '', device.serialNumber ?? '', device.introDate ?? '', device.uPosition, device.uSize, device.status]), `${rack.rackName}_실장도`);
}

function downloadRackTemplate(rack: Rack) {
  writeWorkbook([['예시-WEB01', 'AST-00001', 'SERVER', 'PowerEdge R650', 'web01.local', 'SN-000001', '2026-01-15', 1, 2, 'OPERATING']], `${rack.rackName}_장비업로드_템플릿`);
}

interface ImportRow { rowNumber: number; deviceName: string; assetNo: string; deviceType: string; modelName: string; hostName: string; serialNumber: string; introDate: string; uPosition: number; uSize: number; status: string; errors: string[]; }

function RackExcelImportDialog({ open, onOpenChange, rack, onSuccess }: { open: boolean; onOpenChange: (open: boolean) => void; rack: Rack; onSuccess: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [fileName, setFileName] = useState('');
  const [submitError, setSubmitError] = useState('');

  const importMutation = useMutation({
    mutationFn: async () => {
      const res = await apiFetch(`/api/v1/racks/${rack.id}/devices/import`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ devices: rows.map(({ errors: _errors, rowNumber: _rowNumber, ...device }) => device) }) });
      const data = await res.json(); if (!res.ok) throw new Error(data.error ?? '일괄 등록에 실패했습니다.'); return data;
    },
    onSuccess: () => { onSuccess(); setRows([]); setFileName(''); onOpenChange(false); },
    onError: (cause) => setSubmitError(cause instanceof Error ? cause.message : '일괄 등록에 실패했습니다.'),
  });

  async function readFile(file: File) {
    setSubmitError(''); setFileName(file.name);
    const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: false });
    const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[workbook.SheetNames[0]], { defval: '' });
    const occupied = rack.devices.map((device) => ({ start: device.uPosition, end: device.uPosition + device.uSize - 1, label: device.deviceName }));
    const assetNos = new Set<string>(); const names = new Set<string>();
    const parsed: ImportRow[] = raw.map((item, index) => {
      const row: ImportRow = { rowNumber: index + 2, deviceName: String(item['장비명'] ?? '').trim(), assetNo: String(item['자산번호'] ?? '').trim(), deviceType: String(item['장비유형'] ?? '').trim().toUpperCase(), modelName: String(item['모델명'] ?? '').trim(), hostName: String(item['호스트명'] ?? '').trim(), serialNumber: String(item['시리얼번호'] ?? '').trim(), introDate: String(item['도입일'] ?? '').trim(), uPosition: Number(item['시작U']), uSize: Number(item['사용U']), status: String(item['상태'] ?? 'OPERATING').trim().toUpperCase(), errors: [] };
      if (!row.deviceName) row.errors.push('장비명 누락'); if (!row.assetNo) row.errors.push('자산번호 누락'); if (!row.deviceType) row.errors.push('장비유형 누락');
      if (!Number.isInteger(row.uPosition) || row.uPosition < 1) row.errors.push('시작U 오류'); if (!Number.isInteger(row.uSize) || row.uSize < 1) row.errors.push('사용U 오류');
      const end = row.uPosition + row.uSize - 1; if (end > rack.totalUnit) row.errors.push(`${rack.totalUnit}U 초과`);
      const collision = occupied.find((range) => row.uPosition <= range.end && end >= range.start); if (collision) row.errors.push(`기존 장비 ${collision.label}과 겹침`);
      if (assetNos.has(row.assetNo)) row.errors.push('파일 내 자산번호 중복'); if (names.has(row.deviceName)) row.errors.push('파일 내 장비명 중복'); assetNos.add(row.assetNo); names.add(row.deviceName);
      occupied.push({ start: row.uPosition, end, label: row.deviceName || `${row.rowNumber}행` }); return row;
    });
    if (raw.length === 0) setSubmitError('업로드할 데이터가 없습니다.'); setRows(parsed);
  }

  const errorCount = rows.reduce((sum, row) => sum + (row.errors.length ? 1 : 0), 0);
  return <Dialog open={open} onOpenChange={(value) => { onOpenChange(value); if (!value) { setRows([]); setFileName(''); setSubmitError(''); } }}><DialogContent className="max-w-3xl"><DialogHeader><DialogTitle>랙 장비 엑셀 일괄 등록</DialogTitle><DialogDescription>전체 행 검증을 통과해야만 {rack.rackName} 랙에 일괄 반영됩니다.</DialogDescription></DialogHeader><input ref={inputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void readFile(file); event.target.value = ''; }} /><div className="flex items-center gap-3 rounded-lg border border-dashed p-4"><Button variant="outline" onClick={() => inputRef.current?.click()}><Upload className="mr-1 h-4 w-4" />파일 선택</Button><span className="text-sm text-muted-foreground">{fileName || '엑셀 파일을 선택하세요.'}</span></div>{rows.length > 0 && <><div className={cn('rounded-md px-3 py-2 text-sm', errorCount ? 'bg-destructive/10 text-destructive' : 'bg-emerald-500/10 text-emerald-700')}>총 {rows.length}건 · 정상 {rows.length - errorCount}건 · 오류 {errorCount}건 {errorCount > 0 && '— 오류가 있어 전체 반영이 차단되었습니다.'}</div><ScrollArea className="h-64 rounded-md border"><table className="w-full text-xs"><thead className="sticky top-0 bg-muted"><tr><th className="p-2 text-left">행</th><th className="p-2 text-left">장비명</th><th className="p-2 text-left">자산번호</th><th className="p-2">U 범위</th><th className="p-2 text-left">검증 결과</th></tr></thead><tbody>{rows.map((row) => <tr key={row.rowNumber} className="border-t"><td className="p-2">{row.rowNumber}</td><td className="p-2">{row.deviceName || '-'}</td><td className="p-2">{row.assetNo || '-'}</td><td className="p-2 text-center">{row.uPosition}~{row.uPosition + row.uSize - 1}U</td><td className={cn('p-2', row.errors.length ? 'text-destructive' : 'text-emerald-600')}>{row.errors.length ? row.errors.join(', ') : '정상'}</td></tr>)}</tbody></table></ScrollArea></>}{submitError && <p className="text-sm text-destructive">{submitError}</p>}<DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>취소</Button><Button disabled={!rows.length || errorCount > 0 || importMutation.isPending} onClick={() => importMutation.mutate()}>{importMutation.isPending ? '일괄 반영 중...' : `${rows.length}건 전체 반영`}</Button></DialogFooter></DialogContent></Dialog>;
}

function AssignForm({
  unracked,
  racks,
  rooms,
  initialRackId,
  portTemplates,
  licenses,
  licenseAssignments,
  onSubmit,
  pending,
}: {
  unracked: UnrackedDevice[];
  racks: Rack[];
  rooms: Room[];
  initialRackId: number | null;
  portTemplates: PortTemplate[];
  licenses: SoftwareLicense[];
  licenseAssignments: LicenseAssignment[];
  onSubmit: (placement: PlacementInput) => void;
  pending: boolean;
}) {
  const [deviceId, setDeviceId] = useState<number | null>(unracked[0]?.id ?? null);
  const [rackId, setRackId] = useState<number | null>(initialRackId);
  const [uPosition, setUPosition] = useState<number | null>(null);
  const [licenseIds, setLicenseIds] = useState<number[]>([]);
  const [licenseQuantities, setLicenseQuantities] = useState<Record<number, number>>({});
  const [sourcePort, setSourcePort] = useState('');
  const [targetDeviceId, setTargetDeviceId] = useState('');
  const [targetPort, setTargetPort] = useState('');
  const [cableType, setCableType] = useState('UTP_CAT6');
  const [error, setError] = useState('');

  const selected = unracked.find((d) => d.id === deviceId);
  const roomById = new Map(rooms.map((room) => [room.id, room.roomName]));
  const availableStarts = (rack: Rack, height: number) => {
    const starts: number[] = [];
    for (let start = 1; start <= rack.totalUnit - height + 1; start += 1) {
      const end = start + height - 1;
      const overlap = rack.devices.some((device) => start < device.uPosition + device.uSize && end >= device.uPosition);
      if (!overlap) starts.push(start);
    }
    return starts;
  };
  const eligibleRacks = selected ? racks.filter((rack) => availableStarts(rack, selected.uSize).length > 0) : [];
  const selectedRack = eligibleRacks.find((rack) => rack.id === rackId) ?? null;
  const eligibleStarts = selectedRack && selected ? availableStarts(selectedRack, selected.uSize) : [];
  const templates = selected?.productModelId ? portTemplates.filter((template) => template.productModelId === selected.productModelId) : [];
  const generatedPorts = templates.flatMap((template) => {
    const ports: PlacementInput['ports'] = [];
    for (let index = template.startIndex; index <= template.endIndex; index += Math.max(1, template.indexStep)) {
      ports.push({
        type: template.portType,
        deviceNetworkName: `${template.portPrefix}${String(index).padStart(template.zeroPadding, '0')}`,
        portRole: template.portRole,
      });
    }
    return ports;
  });
  const installedDevices = racks.flatMap((rack) => rack.devices).filter((device) => device.id !== selected?.id);
  const targetDevice = installedDevices.find((device) => device.id === Number(targetDeviceId));
  const targetTemplatePorts = targetDevice?.productModelId
    ? portTemplates
      .filter((template) => template.productModelId === targetDevice.productModelId)
      .flatMap((template) => {
        const ports: { type: string; deviceNetworkName: string; portRole?: string }[] = [];
        for (let index = template.startIndex; index <= template.endIndex; index += Math.max(1, template.indexStep)) {
          ports.push({
            type: template.portType,
            deviceNetworkName: `${template.portPrefix}${String(index).padStart(template.zeroPadding, '0')}`,
            portRole: template.portRole,
          });
        }
        return ports;
      })
    : [];
  const targetPorts = targetDevice?.ports?.length ? targetDevice.ports : targetTemplatePorts;
  const occupiedTargetPorts = new Set(
    racks.flatMap((rack) => rack.devices)
      .flatMap((device) => device.cableLinks ?? [])
      .flatMap((link) => {
        if (link.srcDeviceId === targetDevice?.id) return [link.srcPortName];
        if (link.destDeviceId === targetDevice?.id) return [link.destPortName];
        return [];
      }),
  );
  const availableLicenseCount = (license: SoftwareLicense) =>
    license.purchasedQty - licenseAssignments
      .filter((assignment) => assignment.licenseId === license.id && !assignment.revokedAt)
      .reduce((sum, assignment) => {
        const rawQuantity = assignment.assignedQty ?? 1;
        if (license.assignUnit !== 'CORE') return sum + rawQuantity;
        const packSize = Math.max(1, license.corePackSize ?? 1);
        return sum + (rawQuantity % packSize === 0 ? rawQuantity : rawQuantity * packSize);
      }, 0);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selected || !selectedRack || uPosition == null) return;
    if (!eligibleStarts.includes(uPosition)) return setError('선택한 U 위치에는 장비 높이만큼 연속된 공간이 없습니다.');
    if (targetDeviceId && (!sourcePort || !targetPort.trim())) return setError('케이블 연결의 출발 포트와 대상 포트를 입력하세요.');
    for (const licenseId of licenseIds) {
      const license = licenses.find((item) => item.id === licenseId);
      if (!license) continue;
      const quantity = licenseQuantities[licenseId] ?? 1;
      const available = availableLicenseCount(license);
      if (quantity > available) return setError(`${license.swName}의 잔여 계약 수량이 부족합니다. 잔여 ${available}${license.assignUnit === 'CORE' ? '코어' : license.assignUnit === 'PROCESSOR' ? '소켓' : '개'}입니다.`);
      if (license.assignUnit === 'CORE') {
        const packSize = Math.max(1, license.corePackSize ?? 1);
        if (quantity % packSize !== 0) return setError(`${license.swName}은 ${packSize}코어 단위로만 적용할 수 있습니다.`);
        if (selected.totalCoreCount && quantity > selected.totalCoreCount) return setError(`${license.swName}의 적용 코어가 서버 총 ${selected.totalCoreCount}코어를 초과합니다.`);
      }
      if (license.assignUnit === 'PROCESSOR' && selected.cpuSocketCount && quantity > selected.cpuSocketCount) {
        return setError(`${license.swName}의 적용 소켓이 서버의 ${selected.cpuSocketCount}소켓을 초과합니다.`);
      }
    }
    setError('');
    onSubmit({
      deviceId: selected.id,
      rackId: selectedRack.id,
      uPosition,
      licenses: licenseIds.map((licenseId) => ({ licenseId, assignedQty: licenseQuantities[licenseId] ?? 1 })),
      ports: generatedPorts,
      cableLink: targetDevice ? {
        cableType,
        srcDeviceId: selected.id,
        srcDeviceName: selected.deviceName,
        srcPortName: sourcePort,
        destDeviceId: targetDevice.id,
        destDeviceName: targetDevice.deviceName,
        destPortName: targetPort.trim(),
        memo: `${selected.deviceName} ↔ ${targetDevice.deviceName}`,
      } : undefined,
    });
  }

  if (unracked.length === 0) {
    return <div className="rounded-lg border border-dashed px-4 py-6 text-center"><p className="text-sm font-medium">배치 가능한 장비가 없습니다.</p><p className="mt-1 text-xs text-muted-foreground">IT 자산 목록에서 입고 장비의 검수 완료 처리를 먼저 진행하세요.</p></div>;
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-2">
        <Label>1. 검수완료·미실장 자산</Label>
        <select
          className="h-9 rounded-md border bg-background px-3 text-sm"
          value={deviceId ?? ''}
          onChange={(e) => { setDeviceId(Number(e.target.value)); setRackId(null); setUPosition(null); setSourcePort(''); }}
        >
          {unracked.map((d) => (
            <option key={d.id} value={d.id}>
              {d.deviceName} ({d.modelName || d.deviceType}, {d.uSize}U)
            </option>
          ))}
        </select>
        {selected?.deviceType === 'SERVER' && (
          <div className="mt-2 grid grid-cols-3 gap-2 rounded-lg border border-blue-200 bg-blue-50 p-2.5">
            <div className="text-center"><div className="text-[10px] text-slate-500">CPU 소켓</div><div className="text-sm font-bold text-slate-900">{selected.cpuSocketCount ?? '-'}개</div></div>
            <div className="text-center"><div className="text-[10px] text-slate-500">총 물리 코어</div><div className="text-sm font-bold text-blue-800">{selected.totalCoreCount ?? '-'}코어</div></div>
            <div className="text-center"><div className="text-[10px] text-slate-500">메모리</div><div className="text-sm font-bold text-slate-900">{selected.memoryGb ?? '-'}GB</div></div>
          </div>
        )}
        </div>
        <div className="grid gap-2">
          <Label>2. 설치 가능한 랙</Label>
          <select className="h-9 rounded-md border bg-background px-3 text-sm" value={rackId ?? ''} onChange={(e) => { setRackId(Number(e.target.value)); setUPosition(null); }}>
            <option value="">랙을 선택하세요</option>
            {eligibleRacks.map((rack) => <option key={rack.id} value={rack.id}>{roomById.get(rack.roomId)} · {rack.rackName} ({availableStarts(rack, selected?.uSize ?? 1).length}개 위치)</option>)}
          </select>
        </div>
        <div className="grid gap-2">
          <Label>3. 연속으로 비어 있는 U 위치</Label>
          <select disabled={!selectedRack} className="h-9 rounded-md border bg-background px-3 text-sm disabled:bg-muted" value={uPosition ?? ''} onChange={(e) => setUPosition(Number(e.target.value))}>
            <option value="">시작 U를 선택하세요</option>
            {eligibleStarts.map((start) => <option key={start} value={start}>{start}U ~ {start + (selected?.uSize ?? 1) - 1}U</option>)}
          </select>
        </div>
        <div className="rounded-lg border bg-muted/30 px-3 py-2 text-xs">
          <div className="font-semibold">자동 공간 검증</div>
          <div className="mt-1 text-muted-foreground">{selected ? `${selected.uSize}U 장비 · 연속 ${selected.uSize}U가 확보된 랙만 표시` : '장비를 선택하세요.'}</div>
        </div>
      </div>

      <div className="rounded-lg border p-3">
        <div className="mb-2 text-sm font-semibold">4. 포트·케이블 연결</div>
        <div className="mb-2 text-xs text-muted-foreground">모델 포트 템플릿에서 {generatedPorts.length}개 포트를 자동 생성합니다. 실장과 동시에 연결할 업링크가 있으면 선택하세요.</div>
        {generatedPorts.length > 0 ? (
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5"><Label className="text-xs">출발 포트</Label><select className="h-9 rounded-md border bg-background px-2 text-sm" value={sourcePort} onChange={(e) => setSourcePort(e.target.value)}><option value="">연결 안 함</option>{generatedPorts.map((port) => <option key={port.deviceNetworkName} value={port.deviceNetworkName}>{port.deviceNetworkName} · {port.type}</option>)}</select></div>
            <div className="grid gap-1.5"><Label className="text-xs">연결 대상 장비</Label><select className="h-9 rounded-md border bg-background px-2 text-sm" value={targetDeviceId} onChange={(e) => { setTargetDeviceId(e.target.value); setTargetPort(''); }}><option value="">연결 안 함</option>{installedDevices.map((device) => <option key={device.id} value={device.id}>{device.deviceName} · {device.modelName}</option>)}</select></div>
            <div className="grid gap-1.5">
              <Label className="text-xs">대상 포트</Label>
              <select disabled={!targetDeviceId || targetPorts.length === 0} className="h-9 rounded-md border bg-background px-2 text-sm disabled:bg-muted" value={targetPort} onChange={(e) => setTargetPort(e.target.value)}>
                <option value="">{!targetDeviceId ? '대상 장비를 먼저 선택하세요' : targetPorts.length === 0 ? '등록된 포트가 없습니다' : '사용 가능한 포트를 선택하세요'}</option>
                {targetPorts.map((port, index) => {
                  const occupied = occupiedTargetPorts.has(port.deviceNetworkName);
                  return <option key={`${port.deviceNetworkName}-${index}`} value={port.deviceNetworkName} disabled={occupied}>{port.deviceNetworkName} · {port.type}{port.portRole ? ` · ${port.portRole}` : ''}{occupied ? ' · 연결됨' : ''}</option>;
                })}
              </select>
              {targetDeviceId && targetPorts.length === 0 && <p className="text-[10px] text-amber-700">대상 모델의 포트 템플릿을 먼저 등록해야 연결할 수 있습니다.</p>}
            </div>
            <div className="grid gap-1.5"><Label className="text-xs">케이블 종류</Label><select disabled={!targetDeviceId} className="h-9 rounded-md border bg-background px-2 text-sm" value={cableType} onChange={(e) => setCableType(e.target.value)}><option value="UTP_CAT6">UTP CAT6</option><option value="OM3">OM3 광케이블</option><option value="OM4">OM4 광케이블</option><option value="DAC">DAC</option></select></div>
          </div>
        ) : <div className="rounded bg-amber-50 px-3 py-2 text-xs text-amber-700">이 모델에는 포트 템플릿이 없습니다. 모델·분류체계에서 포트 정보를 먼저 등록하세요.</div>}
      </div>

      <div className="rounded-lg border p-3">
        <div className="mb-2 text-sm font-semibold">5. 소프트웨어·라이선스 할당</div>
        <div className="grid grid-cols-2 gap-2">
          {licenses.map((license) => {
            const available = availableLicenseCount(license);
            const packSize = license.assignUnit === 'CORE' ? Math.max(1, license.corePackSize ?? 1) : 1;
            const selectedQuantity = licenseQuantities[license.id] ?? packSize;
            const deviceCapacity = license.assignUnit === 'CORE' ? (selected?.totalCoreCount ?? available) : license.assignUnit === 'PROCESSOR' ? (selected?.cpuSocketCount ?? available) : 1;
            const rawMaxQuantity = Math.min(available, deviceCapacity);
            const maxQuantity = license.assignUnit === 'CORE' ? Math.floor(rawMaxQuantity / packSize) * packSize : rawMaxQuantity;
            const insufficientForServer = license.assignUnit === 'CORE' && !!selected?.totalCoreCount && available < selected.totalCoreCount;
            return <div key={license.id} className={cn('rounded border px-3 py-2 text-xs', (available <= 0 || maxQuantity <= 0) && 'bg-muted text-muted-foreground')}><label className="flex items-center gap-2"><input type="checkbox" disabled={available <= 0 || maxQuantity <= 0} checked={licenseIds.includes(license.id)} onChange={(e) => { setLicenseIds((current) => e.target.checked ? [...current, license.id] : current.filter((id) => id !== license.id)); if (e.target.checked) setLicenseQuantities((current) => ({ ...current, [license.id]: packSize })); }} /><span className="min-w-0 flex-1"><span className="block truncate font-medium">{license.swName} {license.version}</span><span className="text-[10px] text-muted-foreground">{license.category} · {license.assignUnit === 'CORE' ? `물리 코어당 (${packSize}코어 단위)` : license.assignUnit === 'PROCESSOR' ? '프로세서(소켓)당' : '장비 단위'} · 계약 잔여 {available}{license.assignUnit === 'CORE' ? '코어' : license.assignUnit === 'PROCESSOR' ? '소켓' : '개'}</span>{insufficientForServer && <span className="mt-1 block text-[10px] font-medium text-amber-700">서버 전체 {selected?.totalCoreCount}코어 적용에는 {Number(selected?.totalCoreCount) - available}코어가 부족합니다.</span>}</span></label>{licenseIds.includes(license.id) && ['CORE', 'PROCESSOR'].includes(license.assignUnit) && <div className="mt-2 flex items-center gap-2 border-t pt-2"><span className="text-[10px] text-muted-foreground">{license.assignUnit === 'CORE' ? '라이선스 적용 코어' : '라이선스 적용 소켓'}</span><Input type="number" min={packSize} step={packSize} max={maxQuantity} value={selectedQuantity} onChange={(event) => setLicenseQuantities((current) => ({ ...current, [license.id]: Math.min(maxQuantity, Math.max(packSize, Number(event.target.value))) }))} className="h-7 w-20" /><span className="text-[10px] text-muted-foreground">/ 최대 {maxQuantity}</span></div>}</div>;
          })}
        </div>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <DialogFooter>
        <Button type="submit" disabled={pending || !selectedRack || uPosition == null}>{pending ? '실장 정보 반영 중...' : '랙 실장·포트·라이선스 반영'}</Button>
      </DialogFooter>
    </form>
  );
}

function EditForm({
  rack,
  onSubmit,
  pending,
}: {
  rack: Rack;
  onSubmit: (patch: Partial<Rack>) => void;
  pending: boolean;
}) {
  const [rackName, setRackName] = useState(rack.rackName);
  const [totalUnit, setTotalUnit] = useState(rack.totalUnit);

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); onSubmit({ rackName, totalUnit }); }}
      className="space-y-4"
    >
      <div className="grid gap-2">
        <Label>랙 명칭</Label>
        <Input value={rackName} onChange={(e) => setRackName(e.target.value)} required />
      </div>
      <div className="grid gap-2">
        <Label>총 유닛</Label>
        <Input type="number" min={1} value={totalUnit} onChange={(e) => setTotalUnit(Number(e.target.value))} required />
      </div>
      <DialogFooter>
        <Button type="submit" disabled={pending}>{pending ? '저장 중...' : '저장'}</Button>
      </DialogFooter>
    </form>
  );
}
