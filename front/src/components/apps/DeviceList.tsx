'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef, RowSelectionState } from '@tanstack/react-table';
import { CheckCircle2, ClipboardCheck, Download, PackageCheck, Search } from 'lucide-react';
import { DataTable } from '@/components/common/DataTable';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import ExcelDownloadModal, { type ExcelColumn } from '@/components/common/ExcelDownloadModal';
import { cn } from '@/lib/utils';
import { apiFetch } from '@/lib/api';

/** IT자산 목록 — UI-AST-001 (목록형 공통 템플릿: UI-BKP-001 레이아웃 준용) */
interface Device {
  id: number;
  rackId: number | null;
  deviceName: string;
  deviceType: string;
  modelName: string;
  hostName: string;
  serialNumber: string;
  assetNo: string;
  bizName: string;
  osVersion: string;
  introDate: string;
  status: 'OPERATING' | 'STANDBY' | 'DISPOSED';
  uPosition: number | null;
  uSize: number;
  ports: { id?: number; type: string; deviceNetworkName: string }[];
  cableLinks: { id?: number; srcDeviceName: string; destDeviceName: string; cableType: string; srcPortName?: string; destPortName?: string }[];
  productModelId?: number | null;
  companyId?: number | null;
  lifecycleStatus?: 'RECEIVED' | 'INSPECTION_PASSED' | 'INSTALLED';
  receivedAt?: string | null;
  inspectedAt?: string | null;
  inspectedBy?: string | null;
  inspectionMemo?: string | null;
  installedAt?: string | null;
  cpuSocketCount?: number | null;
  coresPerSocket?: number | null;
  totalCoreCount?: number | null;
  memoryGb?: number | null;
}

interface ProductModel {
  id: number;
  modelName: string;
  vendor: string;
  uSize: number;
  equipmentType?: string;
  supplierCompanyId?: number | null;
  deliveryDate?: string | null;
  cpuSocketCount?: number | null;
  coresPerSocket?: number | null;
  totalCoreCount?: number | null;
  memoryGb?: number | null;
}

interface Company { id: number; companyName: string }

interface Rack {
  id: number;
  rackName: string;
  roomId: number;
}

interface Room {
  id: number;
  roomName: string;
}

interface Backup {
  deviceId: number;
  backupType: string;
  backupSystem: string;
  capacity: string;
}

interface Agent {
  deviceId: number;
  status: string;
  lastReceivedAt: string;
}

interface MaintenanceTask {
  deviceId: number | null;
  kind: string;
  title: string;
  status: string;
  occurredAt: string;
}

const STATUS_LABEL: Record<string, string> = { OPERATING: '운영', STANDBY: '대기', DISPOSED: '폐기' };
const STATUS_COLOR: Record<string, string> = { OPERATING: 'text-emerald-600', STANDBY: 'text-amber-500', DISPOSED: 'text-muted-foreground' };
const LIFECYCLE_LABEL = { RECEIVED: '입고·검수대기', INSPECTION_PASSED: '검수완료·미실장', INSTALLED: '실장완료' } as const;

const DETAIL_TABS = [
  { id: 'info', label: '기본 정보' },
  { id: 'location', label: '실장 위치' },
  { id: 'backup', label: '백업 구성' },
  { id: 'agent', label: '에이전트' },
  { id: 'port', label: '포트 연결' },
  { id: 'history', label: '유지보수 이력' },
] as const;
type DetailTab = (typeof DETAIL_TABS)[number]['id'];

interface DeviceListData {
  action?: 'receive';
  modelId?: number;
  requestId?: number;
}

export default function DeviceList({ data }: { data?: DeviceListData }) {
  const queryClient = useQueryClient();
  const [keyword, setKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [lifecycleFilter, setLifecycleFilter] = useState('');
  const [selected, setSelected] = useState<Device | null>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>('info');
  const [excelOpen, setExcelOpen] = useState(false);
  const [excelScope, setExcelScope] = useState<Device[]>([]);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [assetOpen, setAssetOpen] = useState(data?.action === 'receive');
  const [inspectionOpen, setInspectionOpen] = useState(false);
  const [inspectionMemo, setInspectionMemo] = useState('');
  const [form, setForm] = useState({
    productModelId: data?.modelId ? String(data.modelId) : '', companyId: '', deviceName: '', serialNumber: '',
    hostName: '', bizName: '', osVersion: '', receivedAt: new Date().toISOString().slice(0, 10),
  });

  // data(요청 식별자)가 바뀔 때만 폼을 리셋한다. useEffect 대신 렌더 중 상태 조정 패턴을 쓴다
  // (React 공식 권장: https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes)
  const [handledRequestId, setHandledRequestId] = useState(data?.requestId);
  if (data?.action === 'receive' && data.modelId && data.requestId !== handledRequestId) {
    setHandledRequestId(data.requestId);
    setForm((current) => ({ ...current, productModelId: String(data.modelId) }));
    setAssetOpen(true);
  }

  const { data: devices = [], isLoading } = useQuery<Device[]>({
    queryKey: ['devices', 'list'],
    queryFn: async () => {
      const res = await apiFetch('/api/v1/devices');
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: racks = [] } = useQuery<Rack[]>({
    queryKey: ['racks-flat-min'],
    queryFn: async () => {
      const res = await apiFetch('/api/v1/racks');
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: rooms = [] } = useQuery<Room[]>({
    queryKey: ['rooms-flat-min'],
    queryFn: async () => {
      const res = await apiFetch('/api/v1/rooms');
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: models = [] } = useQuery<ProductModel[]>({
    queryKey: ['productModels'],
    queryFn: async () => {
      const res = await apiFetch('/api/v1/productModels');
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: companies = [] } = useQuery<Company[]>({
    queryKey: ['companies-admin'],
    queryFn: async () => {
      const res = await apiFetch('/api/v1/companies');
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: backups = [] } = useQuery<Backup[]>({
    queryKey: ['backups-min'],
    queryFn: async () => {
      const res = await apiFetch('/api/v1/backups');
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!selected,
  });

  const { data: agents = [] } = useQuery<Agent[]>({
    queryKey: ['agents-min'],
    queryFn: async () => {
      const res = await apiFetch('/api/v1/agents');
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!selected,
  });

  const { data: tasks = [] } = useQuery<MaintenanceTask[]>({
    queryKey: ['maintenance-min'],
    queryFn: async () => {
      const res = await apiFetch('/api/v1/maintenanceTasks');
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!selected,
  });

  const rackById = useMemo(() => new Map(racks.map((r) => [r.id, r])), [racks]);
  const roomById = useMemo(() => new Map(rooms.map((r) => [r.id, r])), [rooms]);
  const companyById = useMemo(() => new Map(companies.map((company) => [company.id, company.companyName])), [companies]);
  const inboundModel = models.find((item) => item.id === Number(form.productModelId));
  const effectiveCompanyId = form.companyId || (inboundModel?.supplierCompanyId ? String(inboundModel.supplierCompanyId) : '');
  const generatedAssetNo = nextAssetNumber(devices);
  const missingReceiptFields = [
    !form.productModelId && '모델',
    !effectiveCompanyId && '납품업체',
    !form.deviceName.trim() && '장비명',
    !form.serialNumber.trim() && '시리얼번호',
    !form.receivedAt && '입고일',
  ].filter(Boolean) as string[];

  const createAsset = useMutation({
    mutationFn: async () => {
      const model = models.find((item) => item.id === Number(form.productModelId));
      if (!model) throw new Error('모델을 선택하세요.');
      const res = await apiFetch('/api/v1/devices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productModelId: model.id,
          modelName: model.modelName,
          deviceType: model.equipmentType ?? 'ETC',
          uSize: model.uSize,
          cpuSocketCount: model.cpuSocketCount ?? null,
          coresPerSocket: model.coresPerSocket ?? null,
          totalCoreCount: model.totalCoreCount ?? null,
          memoryGb: model.memoryGb ?? null,
          companyId: effectiveCompanyId ? Number(effectiveCompanyId) : null,
          assetNo: generatedAssetNo,
          deviceName: form.deviceName.trim(),
          serialNumber: form.serialNumber.trim(),
          hostName: form.hostName.trim(),
          bizName: form.bizName.trim(),
          osVersion: form.osVersion.trim(),
          introDate: model.deliveryDate ?? form.receivedAt,
          receivedAt: form.receivedAt,
          lifecycleStatus: 'RECEIVED',
          status: 'STANDBY',
          rackId: null,
          uPosition: null,
          ports: [],
          cableLinks: [],
        }),
      });
      if (!res.ok) throw new Error('자산 입고 등록에 실패했습니다.');
      return res.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['devices'] });
      setAssetOpen(false);
      setLifecycleFilter('RECEIVED');
      setForm({ productModelId: '', companyId: '', deviceName: '', serialNumber: '', hostName: '', bizName: '', osVersion: '', receivedAt: new Date().toISOString().slice(0, 10) });
    },
  });

  const approveInspection = useMutation({
    mutationFn: async (device: Device) => {
      const res = await apiFetch(`/api/v1/devices/${device.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lifecycleStatus: 'INSPECTION_PASSED',
          inspectedAt: new Date().toISOString(),
          inspectedBy: '관리자',
          inspectionMemo: inspectionMemo.trim() || null,
        }),
      });
      if (!res.ok) throw new Error('검수 완료 처리에 실패했습니다.');
      return res.json() as Promise<Device>;
    },
    onSuccess: async (updated) => {
      await queryClient.invalidateQueries({ queryKey: ['devices'] });
      setSelected(updated);
      setInspectionOpen(false);
      setInspectionMemo('');
    },
  });

  const activateInstalledDevice = useMutation({
    mutationFn: async (device: Device) => {
      const res = await apiFetch(`/api/v1/devices/${device.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'OPERATING' }),
      });
      if (!res.ok) throw new Error('운영 상태 전환에 실패했습니다.');
      return res.json() as Promise<Device>;
    },
    onSuccess: async (updated) => {
      await queryClient.invalidateQueries({ queryKey: ['devices'] });
      setSelected(updated);
    },
  });

  const filtered = devices.filter((d) => {
    const matchesKeyword =
      !keyword ||
      d.deviceName.includes(keyword) ||
      d.hostName.includes(keyword) ||
      d.assetNo.includes(keyword);
    const matchesStatus = !statusFilter || d.status === statusFilter;
    const matchesLifecycle = !lifecycleFilter || getLifecycle(d) === lifecycleFilter;
    return matchesKeyword && matchesStatus && matchesLifecycle;
  });

  const columns: ColumnDef<Device, unknown>[] = [
    { accessorKey: 'assetNo', header: '자산번호' },
    { accessorKey: 'deviceName', header: '장비명' },
    { accessorKey: 'hostName', header: '호스트명' },
    { accessorKey: 'modelName', header: '모델' },
    {
      id: 'lifecycle',
      header: '납품 처리단계',
      cell: ({ row }) => <LifecycleBadge status={getLifecycle(row.original)} />,
    },
    { accessorKey: 'bizName', header: '업무명' },
    {
      id: 'location',
      header: '위치(랙/U)',
      cell: ({ row }) => {
        const d = row.original;
        const rack = d.rackId ? rackById.get(d.rackId) : null;
        return rack ? `${rack.rackName} / ${d.uPosition}U` : '미실장';
      },
    },
    {
      accessorKey: 'introDate',
      header: '도입일',
      cell: ({ row }) => {
        const value = row.original.introDate;
        if (!value) return <span className="text-muted-foreground">-</span>;
        const date = new Date(value);
        return <span className="whitespace-nowrap tabular-nums">{Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('ko-KR')}</span>;
      },
    },
    {
      accessorKey: 'status',
      header: '운영상태',
      cell: (c) => {
        const v = c.getValue<string>();
        return <span className={STATUS_COLOR[v]}>{STATUS_LABEL[v] ?? v}</span>;
      },
    },
  ];

  const excelColumns: ExcelColumn<Device>[] = [
    { id: 'assetNo', displayText: '자산번호', accessor: 'assetNo' },
    { id: 'deviceName', displayText: '장비명', accessor: 'deviceName' },
    { id: 'hostName', displayText: '호스트명', accessor: 'hostName' },
    { id: 'modelName', displayText: '모델', accessor: 'modelName' },
    { id: 'lifecycle', displayText: '납품 처리단계', accessor: (d) => LIFECYCLE_LABEL[getLifecycle(d)], multisheet: true },
    { id: 'bizName', displayText: '업무명', accessor: 'bizName', multisheet: true },
    {
      id: 'location',
      displayText: '위치(랙/U)',
      accessor: (d) => {
        const rack = d.rackId ? rackById.get(d.rackId) : null;
        return rack ? `${rack.rackName} / ${d.uPosition}U` : '미실장';
      },
    },
    { id: 'osVersion', displayText: 'OS/버전', accessor: 'osVersion' },
    { id: 'introDate', displayText: '도입일', accessor: 'introDate' },
    { id: 'status', displayText: '상태', accessor: (d) => STATUS_LABEL[d.status] ?? d.status, multisheet: true },
  ];

  return (
    <div className="flex h-full flex-col gap-3 p-4">
      <div className="flex items-center gap-2">
        <div className="relative w-72">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="장비명 · 호스트명 · 자산번호 검색"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
        </div>
        <select
          className="h-9 rounded-md border bg-background px-3 text-sm"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="">전체 상태</option>
          <option value="OPERATING">운영</option>
          <option value="STANDBY">대기</option>
          <option value="DISPOSED">폐기</option>
        </select>
        <select
          className="h-9 rounded-md border bg-background px-3 text-sm"
          value={lifecycleFilter}
          onChange={(e) => setLifecycleFilter(e.target.value)}
        >
          <option value="">전체 처리단계</option>
          <option value="RECEIVED">입고·검수대기</option>
          <option value="INSPECTION_PASSED">검수완료·미실장</option>
          <option value="INSTALLED">실장완료</option>
        </select>
        <span className="text-xs text-muted-foreground">{filtered.length}건</span>
        <div className="ml-auto flex gap-2">
          <Button
            variant="outline"
            onClick={() => { setExcelScope(filtered); setExcelOpen(true); }}
            disabled={filtered.length === 0}
          >
            ⤓ 엑셀
          </Button>
        </div>
      </div>

      <Card className="min-h-0 flex-1 flex-col overflow-hidden py-0">
        <CardContent className="flex h-full min-h-0 flex-col overflow-hidden p-3">
          <DataTable
            columns={columns}
            data={filtered}
            loading={isLoading}
            onRowClick={(d) => { setSelected(d); setDetailTab('info'); }}
            enableRowSelection
            rowSelection={rowSelection}
            onRowSelectionChange={setRowSelection}
            getRowId={(d) => String(d.id)}
            bulkActions={(rows) => (
              <Button
                size="sm"
                variant="outline"
                onClick={() => { setExcelScope(rows); setExcelOpen(true); }}
              >
                <Download className="mr-1 h-3.5 w-3.5" /> 선택 항목 엑셀로 내보내기 ({rows.length})
              </Button>
            )}
          />
        </CardContent>
      </Card>

      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="sm:max-w-2xl">
          {selected && (
            <>
              <DialogHeader>
                <div className="flex items-start justify-between gap-3 pr-8">
                  <div>
                    <DialogTitle>{selected.deviceName}</DialogTitle>
                    <div className="mt-2"><LifecycleBadge status={getLifecycle(selected)} /></div>
                  </div>
                  {getLifecycle(selected) === 'RECEIVED' && (
                    <Button size="sm" onClick={() => setInspectionOpen(true)}><ClipboardCheck className="mr-1 h-4 w-4" />검수 완료 처리</Button>
                  )}
                  {getLifecycle(selected) === 'INSTALLED' && selected.status === 'STANDBY' && (
                    <Button size="sm" onClick={() => activateInstalledDevice.mutate(selected)} disabled={activateInstalledDevice.isPending}>
                      <CheckCircle2 className="mr-1 h-4 w-4" />{activateInstalledDevice.isPending ? '전환 중...' : '운영 상태로 전환'}
                    </Button>
                  )}
                </div>
              </DialogHeader>

              <div className="flex gap-1 border-b">
                {DETAIL_TABS.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setDetailTab(t.id)}
                    className={cn(
                      '-mb-px rounded-t-md border px-3 py-1.5 text-sm transition-colors',
                      detailTab === t.id
                        ? 'border-border border-b-background bg-background font-medium'
                        : 'border-transparent text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              <div className="min-h-[220px] py-2 text-sm">
                {detailTab === 'info' && (
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="장비명" value={selected.deviceName} />
                    <Field label="호스트명" value={selected.hostName} />
                    <Field label="자산번호" value={selected.assetNo} />
                    <Field label="모델" value={selected.modelName} />
                    <Field label="업무명" value={selected.bizName} />
                    <Field label="OS/버전" value={selected.osVersion} />
                    <Field label="도입일" value={selected.introDate} />
                    <Field label="운영 상태" value={STATUS_LABEL[selected.status]} />
                    <Field label="납품업체" value={selected.companyId ? companyById.get(selected.companyId) : '-'} />
                    <Field label="입고일" value={selected.receivedAt ?? selected.introDate} />
                    <Field label="검수일" value={selected.inspectedAt ?? '-'} />
                    <Field label="검수자" value={selected.inspectedBy ?? '-'} />
                  </div>
                )}

                {detailTab === 'location' && (() => {
                  const rack = selected.rackId ? rackById.get(selected.rackId) : null;
                  const room = rack ? roomById.get(rack.roomId) : null;
                  return rack ? (
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="전산실" value={room?.roomName ?? '-'} />
                      <Field label="랙" value={rack.rackName} />
                      <Field label="시작 U" value={String(selected.uPosition)} />
                      <Field label="크기" value={`${selected.uSize}U`} />
                    </div>
                  ) : (
                    <EmptyState text="미실장 상태입니다." />
                  );
                })()}

                {detailTab === 'backup' && (() => {
                  const backup = backups.find((b) => b.deviceId === selected.id);
                  return backup ? (
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="유형" value={backup.backupType} />
                      <Field label="시스템" value={backup.backupSystem} />
                      <Field label="용량" value={backup.capacity} />
                    </div>
                  ) : (
                    <EmptyState text="등록된 백업 구성이 없습니다." />
                  );
                })()}

                {detailTab === 'agent' && (() => {
                  const agent = agents.find((a) => a.deviceId === selected.id);
                  return agent ? (
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="상태" value={agent.status === 'NORMAL' ? '정상' : '미수신'} />
                      <Field label="최근 수신" value={agent.lastReceivedAt} />
                    </div>
                  ) : (
                    <EmptyState text="에이전트가 설치되지 않았습니다." />
                  );
                })()}

                {detailTab === 'port' && (
                  selected.ports.length === 0 && selected.cableLinks.length === 0 ? (
                    <EmptyState text="포트/연결 정보가 없습니다." />
                  ) : (
                    <div className="space-y-2">
                      {selected.ports.map((p, index) => (
                        <div key={p.id != null ? `port-${p.id}` : `port-${p.deviceNetworkName}-${p.type}-${index}`} className="flex justify-between rounded border px-3 py-1.5">
                          <span>{p.deviceNetworkName}</span>
                          <span className="text-muted-foreground">{p.type}</span>
                        </div>
                      ))}
                      {selected.cableLinks.map((c, index) => (
                        <div key={c.id != null ? `cable-${c.id}` : `cable-${c.srcDeviceName}-${c.srcPortName ?? ''}-${c.destDeviceName}-${c.destPortName ?? ''}-${index}`} className="flex justify-between rounded border px-3 py-1.5">
                          <span>{c.srcDeviceName} ↔ {c.destDeviceName}</span>
                          <span className="text-muted-foreground">{c.cableType}</span>
                        </div>
                      ))}
                    </div>
                  )
                )}

                {detailTab === 'history' && (() => {
                  const history = tasks.filter((t) => t.deviceId === selected.id);
                  return history.length === 0 ? (
                    <EmptyState text="유지보수 이력이 없습니다." />
                  ) : (
                    <div className="space-y-2">
                      {history.map((t, i) => (
                        <div key={i} className="flex justify-between rounded border px-3 py-1.5">
                          <span>{t.title}</span>
                          <span className="text-muted-foreground">{t.occurredAt}</span>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={assetOpen} onOpenChange={setAssetOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><PackageCheck className="h-5 w-5 text-blue-700" />자산 입고 등록</DialogTitle>
            <DialogDescription>검수 전 장비는 미실장 상태로 등록됩니다. 검수 완료 후 랙 상세·실장도에서만 배치할 수 있습니다.</DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
            처리 흐름: <strong>입고·검수대기</strong> → 검수 완료 → <strong>검수완료·미실장</strong> → 랙 배치 → <strong>실장완료</strong>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 py-2">
            <FormField label="등록 모델 *">
              <select
                className="h-9 w-full rounded-md border bg-white px-3 text-sm"
                value={form.productModelId}
                onChange={(event) => {
                  const model = models.find((item) => item.id === Number(event.target.value));
                  setForm({
                    ...form,
                    productModelId: event.target.value,
                    companyId: model?.supplierCompanyId ? String(model.supplierCompanyId) : form.companyId,
                  });
                }}
              >
                <option value="">모델을 선택하세요</option>
                {models.map((model) => <option key={model.id} value={model.id}>{model.vendor} · {model.modelName}</option>)}
              </select>
            </FormField>
            <FormField label="납품업체 *">
              <select className="h-9 w-full rounded-md border bg-white px-3 text-sm" value={effectiveCompanyId} onChange={(event) => setForm({ ...form, companyId: event.target.value })}>
                <option value="">업체를 선택하세요</option>
                {companies.map((company) => <option key={company.id} value={company.id}>{company.companyName}</option>)}
              </select>
            </FormField>
            <FormField label="자산번호 (자동 발급)">
              <div className="flex h-9 items-center rounded-md border bg-slate-100 px-3 font-mono text-sm font-semibold text-blue-800">{generatedAssetNo}</div>
            </FormField>
            <FormField label="장비명 *"><Input value={form.deviceName} onChange={(event) => setForm({ ...form, deviceName: event.target.value })} placeholder="예: WEB-SRV-01" /></FormField>
            <FormField label="시리얼번호 *"><Input value={form.serialNumber} onChange={(event) => setForm({ ...form, serialNumber: event.target.value })} /></FormField>
            <FormField label="입고일 *"><Input type="date" value={form.receivedAt} onChange={(event) => setForm({ ...form, receivedAt: event.target.value })} /></FormField>
            <FormField label="호스트명"><Input value={form.hostName} onChange={(event) => setForm({ ...form, hostName: event.target.value })} /></FormField>
            <FormField label="업무명"><Input value={form.bizName} onChange={(event) => setForm({ ...form, bizName: event.target.value })} /></FormField>
            <FormField label="OS/버전"><Input value={form.osVersion} onChange={(event) => setForm({ ...form, osVersion: event.target.value })} /></FormField>
            <div className="rounded-lg border bg-slate-50 px-3 py-2 text-xs text-slate-600">
              <div className="font-semibold text-slate-800">위치 정보</div>
              <div className="mt-1">서버실: 미지정 · 랙: 미지정 · U: 미지정</div>
            </div>
          </div>
          {createAsset.error && <p className="text-sm text-red-600">{createAsset.error.message}</p>}
          {missingReceiptFields.length > 0 && (
            <div className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
              등록 버튼을 활성화하려면 다음 항목을 입력하세요: <strong>{missingReceiptFields.join(', ')}</strong>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssetOpen(false)}>취소</Button>
            <Button
              disabled={missingReceiptFields.length > 0 || createAsset.isPending}
              onClick={() => createAsset.mutate()}
            >
              {createAsset.isPending ? '등록 중...' : '입고·검수대기로 등록'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={inspectionOpen} onOpenChange={setInspectionOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5 text-emerald-600" />검수 완료 처리</DialogTitle>
            <DialogDescription>자산번호와 시리얼번호, 외관 및 수량 검수를 완료한 장비만 승인하세요.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="rounded-lg border bg-slate-50 p-3 text-sm">
              <div className="font-semibold">{selected?.deviceName}</div>
              <div className="mt-1 text-xs text-slate-500">{selected?.assetNo} · {selected?.serialNumber}</div>
            </div>
            <FormField label="검수 메모">
              <Input value={inspectionMemo} onChange={(event) => setInspectionMemo(event.target.value)} placeholder="예: 수량·외관·시리얼 대조 완료" />
            </FormField>
            <p className="text-xs text-slate-500">승인 후 `랙 상세·실장도`의 미실장 자산 목록에서 선택할 수 있습니다.</p>
          </div>
          {approveInspection.error && <p className="text-sm text-red-600">{approveInspection.error.message}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setInspectionOpen(false)}>취소</Button>
            <Button disabled={!selected || approveInspection.isPending} onClick={() => selected && approveInspection.mutate(selected)}>
              {approveInspection.isPending ? '처리 중...' : '검수 완료 승인'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ExcelDownloadModal
        open={excelOpen}
        onOpenChange={setExcelOpen}
        data={excelScope}
        excelColumns={excelColumns}
        title="IT자산 목록 다운로드"
        description={excelScope.length < filtered.length ? `선택한 ${excelScope.length}건을 엑셀로 다운로드합니다.` : '현재 검색·필터 조건이 적용된 자산 목록을 엑셀로 다운로드합니다.'}
        defaultFileName="IT자산목록"
      />
    </div>
  );
}

function Field({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex justify-between border-b pb-1">
      <span className="text-muted-foreground">{label}</span>
      <span>{value ?? '-'}</span>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="flex h-24 items-center justify-center text-muted-foreground">{text}</div>;
}

function getLifecycle(device: Device): 'RECEIVED' | 'INSPECTION_PASSED' | 'INSTALLED' {
  if (device.rackId != null) return 'INSTALLED';
  return device.lifecycleStatus === 'RECEIVED' ? 'RECEIVED' : 'INSPECTION_PASSED';
}

function LifecycleBadge({ status }: { status: 'RECEIVED' | 'INSPECTION_PASSED' | 'INSTALLED' }) {
  return (
    <span className={cn(
      'inline-flex whitespace-nowrap rounded-full px-2 py-1 text-[11px] font-semibold',
      status === 'RECEIVED' && 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
      status === 'INSPECTION_PASSED' && 'bg-blue-50 text-blue-700 ring-1 ring-blue-200',
      status === 'INSTALLED' && 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
    )}>
      {LIFECYCLE_LABEL[status]}
    </span>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>;
}

function nextAssetNumber(devices: Device[]) {
  const maxSequence = devices.reduce((max, device) => {
    const match = device.assetNo?.match(/(\d+)$/);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  return `AST-${new Date().getFullYear()}-${String(maxSequence + 1).padStart(5, '0')}`;
}
