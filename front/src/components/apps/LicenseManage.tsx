'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2,
  KeyRound,
  MonitorCog,
  PackagePlus,
  Pencil,
  Search,
  ShieldCheck,
  Trash2,
  Undo2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { apiFetch } from '@/lib/api';
import { cn } from '@/lib/utils';

type LicenseCategory = 'OS' | 'SOFTWARE';
type AssignUnit = 'NODE' | 'AGENT' | 'PROCESSOR' | 'CORE';

interface License {
  id: number;
  swName: string;
  version: string;
  category: LicenseCategory;
  assignUnit: AssignUnit;
  purchasedQty: number;
  corePackSize?: number;
  expireDate: string;
  licenseKey: string;
}

interface Assignment {
  id: number;
  licenseId: number;
  deviceId: number | null;
  memberId: number | null;
  assignedAt: string;
  revokedAt: string | null;
  assignedQty?: number;
}

interface Device {
  id: number;
  deviceName: string;
  assetNo?: string;
  modelName?: string;
  lifecycleStatus?: string;
  status?: string;
  cpuSocketCount?: number | null;
  totalCoreCount?: number | null;
  productModelId?: number | null;
}

interface ProductModel {
  id: number;
  cpuSocketCount?: number | null;
  totalCoreCount?: number | null;
}

interface LicenseForm {
  swName: string;
  version: string;
  category: LicenseCategory;
  assignUnit: AssignUnit;
  purchasedQty: string;
  corePackSize: string;
  expireDate: string;
  licenseKey: string;
}

const EMPTY_FORM: LicenseForm = {
  swName: '',
  version: '',
  category: 'SOFTWARE',
  assignUnit: 'NODE',
  purchasedQty: '1',
  corePackSize: '1',
  expireDate: '',
  licenseKey: '',
};

const CATEGORY = {
  OS: { label: '운영체제(OS)', description: 'Windows, Linux, UNIX, 가상화 OS', icon: MonitorCog },
  SOFTWARE: { label: '업무·관리 소프트웨어', description: '백업, 모니터링, 보안, 에이전트', icon: PackagePlus },
} satisfies Record<LicenseCategory, { label: string; description: string; icon: typeof MonitorCog }>;

const ASSIGN_LABEL: Record<AssignUnit, string> = {
  NODE: '장비(노드) 단위',
  AGENT: '에이전트 설치 단위',
  PROCESSOR: '프로세서(소켓) 단위',
  CORE: '물리 코어 단위',
};

const quantityUnit = (assignUnit: AssignUnit) =>
  assignUnit === 'CORE' ? '코어' : assignUnit === 'PROCESSOR' ? '소켓' : '개';

const contractQuantityLabel = (assignUnit: AssignUnit) =>
  assignUnit === 'CORE'
    ? '계약 코어 수'
    : assignUnit === 'PROCESSOR'
      ? '계약 프로세서(소켓) 수'
      : '구매 수량';

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await apiFetch(url, init);
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.message ?? payload?.error ?? '요청을 처리하지 못했습니다.');
  }
  return response.status === 204 ? (undefined as T) : response.json();
}

function maskKey(key: string) {
  if (!key) return '키 미등록';
  if (key.length < 10) return '••••••••';
  return `${key.slice(0, 5)}-•••••-•••••-${key.slice(-5)}`;
}

export default function LicenseManage({ data }: { data?: unknown }) {
  void data;
  const queryClient = useQueryClient();
  const [category, setCategory] = useState<LicenseCategory | 'ALL'>('ALL');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<License | null>(null);
  const [form, setForm] = useState<LicenseForm>(EMPTY_FORM);
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignDeviceId, setAssignDeviceId] = useState('');
  const [assignQuantity, setAssignQuantity] = useState('1');
  const [deviceSearch, setDeviceSearch] = useState('');
  const [message, setMessage] = useState('');

  const { data: licenses = [], isLoading } = useQuery<License[]>({
    queryKey: ['swLicenses'],
    queryFn: () => request('/api/v1/swLicenses'),
  });
  const { data: assignments = [] } = useQuery<Assignment[]>({
    queryKey: ['licenseAssignments'],
    queryFn: () => request('/api/v1/licenseAssignments'),
  });
  const { data: devices = [] } = useQuery<Device[]>({
    queryKey: ['devices', 'license-options'],
    queryFn: () => request('/api/v1/devices'),
  });
  const { data: productModels = [] } = useQuery<ProductModel[]>({
    queryKey: ['productModels'],
    queryFn: () => request('/api/v1/productModels'),
  });

  const selected = licenses.find((license) => license.id === selectedId) ?? null;
  const assignmentsForSelected = selected ? assignments.filter((assignment) => assignment.licenseId === selected.id) : [];
  const activeAssignments = assignmentsForSelected.filter((assignment) => !assignment.revokedAt);
  const deviceById = useMemo(() => new Map(devices.map((device) => [device.id, device])), [devices]);
  const licenseById = useMemo(() => new Map(licenses.map((license) => [license.id, license])), [licenses]);
  const productModelById = useMemo(() => new Map(productModels.map((model) => [model.id, model])), [productModels]);
  const assignedDeviceIds = new Set(activeAssignments.map((assignment) => assignment.deviceId).filter((id): id is number => id != null));
  const availableDevices = devices.filter((device) => {
    if (assignedDeviceIds.has(device.id)) return false;
    const keyword = deviceSearch.trim().toLowerCase();
    return !keyword || `${device.deviceName} ${device.assetNo ?? ''} ${device.modelName ?? ''}`.toLowerCase().includes(keyword);
  });
  const filtered = licenses.filter((license) => {
    if (category !== 'ALL' && license.category !== category) return false;
    const keyword = search.trim().toLowerCase();
    return !keyword || `${license.swName} ${license.version}`.toLowerCase().includes(keyword);
  });

  const assignmentUsage = (assignment: Assignment) => {
    const rawQuantity = assignment.assignedQty ?? 1;
    const license = licenseById.get(assignment.licenseId);
    if (license?.assignUnit !== 'CORE') return rawQuantity;
    const packSize = Math.max(1, license.corePackSize ?? 1);
    return rawQuantity % packSize === 0 ? rawQuantity : rawQuantity * packSize;
  };
  const activeCount = (licenseId: number) => assignments
    .filter((assignment) => assignment.licenseId === licenseId && !assignment.revokedAt)
    .reduce((sum, assignment) => sum + assignmentUsage(assignment), 0);
  const usedQuantity = activeAssignments.reduce((sum, assignment) => sum + assignmentUsage(assignment), 0);
  const remaining = selected ? Math.max(0, selected.purchasedQty - usedQuantity) : 0;
  const selectedAssignDevice = deviceById.get(Number(assignDeviceId));
  const selectedAssignModel = selectedAssignDevice?.productModelId
    ? productModelById.get(selectedAssignDevice.productModelId)
    : undefined;
  const deviceTotalCoreCount = selectedAssignDevice?.totalCoreCount ?? selectedAssignModel?.totalCoreCount ?? 0;
  const deviceTotalSocketCount = selectedAssignDevice?.cpuSocketCount ?? selectedAssignModel?.cpuSocketCount ?? 0;
  const deviceActiveAssignments = assignments.filter(
    (assignment) => !assignment.revokedAt && assignment.deviceId === selectedAssignDevice?.id,
  );
  const deviceAppliedCoreCount = deviceActiveAssignments
    .filter((assignment) => licenseById.get(assignment.licenseId)?.assignUnit === 'CORE')
    .reduce((sum, assignment) => sum + assignmentUsage(assignment), 0);
  const deviceAppliedSocketCount = deviceActiveAssignments
    .filter((assignment) => licenseById.get(assignment.licenseId)?.assignUnit === 'PROCESSOR')
    .reduce((sum, assignment) => sum + assignmentUsage(assignment), 0);
  const deviceIdleCoreCount = Math.max(0, deviceTotalCoreCount - deviceAppliedCoreCount);
  const deviceIdleSocketCount = Math.max(0, deviceTotalSocketCount - deviceAppliedSocketCount);
  const deviceAssignmentCapacity = selected?.assignUnit === 'CORE'
    ? (deviceTotalCoreCount > 0 ? deviceIdleCoreCount : remaining)
    : selected?.assignUnit === 'PROCESSOR'
      ? (deviceTotalSocketCount > 0 ? deviceIdleSocketCount : remaining)
      : 1;
  const maxAssignQuantity = Math.min(remaining, deviceAssignmentCapacity);
  const corePackSize = selected?.assignUnit === 'CORE' ? Math.max(1, selected.corePackSize ?? 1) : 1;
  const maxAssignableQuantity = selected?.assignUnit === 'CORE'
    ? Math.floor(maxAssignQuantity / corePackSize) * corePackSize
    : maxAssignQuantity;

  const saveLicense = useMutation({
    mutationFn: () => request<License>(editing ? `/api/v1/swLicenses/${editing.id}` : '/api/v1/swLicenses', {
      method: editing ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        swName: form.swName.trim(),
        version: form.version.trim(),
        category: form.category,
        assignUnit: form.assignUnit,
        purchasedQty: Number(form.purchasedQty),
        corePackSize: form.assignUnit === 'CORE' ? Number(form.corePackSize) : null,
        expireDate: form.expireDate,
        licenseKey: form.licenseKey.trim(),
      }),
    }),
    onSuccess: async (saved) => {
      await queryClient.invalidateQueries({ queryKey: ['swLicenses'] });
      setSelectedId(saved.id);
      setFormOpen(false);
      setMessage(editing ? '라이선스 정보를 수정했습니다.' : '새 라이선스를 등록했습니다.');
    },
  });

  const deleteLicense = useMutation({
    mutationFn: (license: License) => request(`/api/v1/swLicenses/${license.id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['swLicenses'] });
      setSelectedId(null);
      setFormOpen(false);
      setMessage('라이선스를 삭제했습니다.');
    },
  });

  const assignLicense = useMutation({
    mutationFn: () => request<Assignment>('/api/v1/licenseAssignments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        licenseId: selected?.id,
        deviceId: Number(assignDeviceId),
        memberId: null,
        assignedAt: new Date().toISOString(),
        revokedAt: null,
        assignedQty: Number(assignQuantity),
        appliedCoreCount: selected?.assignUnit === 'CORE' ? Number(assignQuantity) : null,
        licenseUnitQty: selected?.assignUnit === 'CORE'
          ? Number(assignQuantity) / Math.max(1, selected.corePackSize ?? 1)
          : Number(assignQuantity),
      }),
    }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['licenseAssignments'] });
      setAssignOpen(false);
      setAssignDeviceId('');
      setAssignQuantity('1');
      setDeviceSearch('');
      setMessage('선택한 자산에 라이선스를 할당했습니다.');
    },
  });

  const revokeLicense = useMutation({
    mutationFn: (assignment: Assignment) => request(`/api/v1/licenseAssignments/${assignment.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ revokedAt: new Date().toISOString() }),
    }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['licenseAssignments'] });
      setMessage('라이선스를 회수했습니다.');
    },
  });

  const startCreate = () => {
    setEditing(null);
    setForm({ ...EMPTY_FORM, category: category === 'ALL' ? 'SOFTWARE' : category });
    setFormOpen(true);
  };
  const startEdit = (license: License) => {
    setEditing(license);
    setForm({
      swName: license.swName,
      version: license.version,
      category: license.category,
      assignUnit: license.assignUnit,
      purchasedQty: String(license.purchasedQty),
      corePackSize: String(license.corePackSize ?? 1),
      expireDate: license.expireDate,
      licenseKey: license.licenseKey,
    });
    setFormOpen(true);
  };

  const validForm = form.swName.trim()
    && form.version.trim()
    && Number(form.purchasedQty) > 0
    && (form.assignUnit !== 'CORE' || (Number(form.corePackSize) > 0 && Number(form.purchasedQty) % Number(form.corePackSize) === 0))
    && form.expireDate
    && form.licenseKey.trim();
  const usedByEditing = editing ? activeCount(editing.id) : 0;

  return (
    <div className="flex h-full min-h-0 flex-col bg-slate-50/70">
      <header className="border-b bg-white px-5 py-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-2 text-xl font-bold text-slate-900"><KeyRound className="h-5 w-5 text-blue-700" />소프트웨어·라이선스 관리</h1>
            <p className="mt-1 text-sm text-slate-500">분류별 라이선스와 구매 수량을 관리하고 실제 IT 자산에 할당합니다.</p>
          </div>
          <Button onClick={startCreate}><PackagePlus className="mr-1.5 h-4 w-4" />신규 라이선스 등록</Button>
        </div>
        {message && <div className="mt-3 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</div>}
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-[260px_minmax(420px,1fr)_390px] gap-3 p-3">
        <section className="flex min-h-0 flex-col rounded-xl border bg-white shadow-sm">
          <div className="border-b px-4 py-3">
            <div className="text-sm font-semibold">라이선스 분류</div>
            <div className="mt-0.5 text-[11px] text-slate-500">제품 유형별로 관리</div>
          </div>
          <div className="space-y-1.5 p-2">
            <CategoryButton active={category === 'ALL'} label="전체 라이선스" description={`${licenses.length}개 제품`} icon={KeyRound} onClick={() => setCategory('ALL')} />
            {(Object.keys(CATEGORY) as LicenseCategory[]).map((key) => {
              const config = CATEGORY[key];
              return <CategoryButton key={key} active={category === key} label={config.label} description={`${licenses.filter((license) => license.category === key).length}개 · ${config.description}`} icon={config.icon} onClick={() => setCategory(key)} />;
            })}
          </div>
          <div className="mt-auto border-t p-3">
            <div className="rounded-lg bg-blue-50 p-3 text-xs text-blue-800">
              <div className="font-semibold">할당 원칙</div>
              <p className="mt-1 leading-5">구매 수량을 초과해 할당할 수 없습니다. 회수된 라이선스는 다시 할당할 수 있습니다.</p>
            </div>
          </div>
        </section>

        <section className="flex min-h-0 flex-col rounded-xl border bg-white shadow-sm">
          <div className="flex items-center gap-3 border-b p-3">
            <div className="relative min-w-0 flex-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <Input value={search} onChange={(event) => setSearch(event.target.value)} className="pl-9" placeholder="제품명 또는 버전 검색" />
            </div>
            <span className="text-xs text-slate-500">{filtered.length}개 제품</span>
          </div>
          <ScrollArea className="min-h-0 flex-1">
            {isLoading ? (
              <div className="flex h-40 items-center justify-center text-sm text-slate-400">라이선스를 불러오는 중...</div>
            ) : filtered.length === 0 ? (
              <div className="flex h-64 flex-col items-center justify-center text-center">
                <KeyRound className="mb-3 h-10 w-10 text-slate-300" />
                <p className="font-medium text-slate-700">등록된 라이선스가 없습니다.</p>
                <Button className="mt-4" size="sm" onClick={startCreate}>신규 등록</Button>
              </div>
            ) : (
              <div className="divide-y">
                {filtered.map((license) => {
                  const assigned = activeCount(license.id);
                  const available = Math.max(0, license.purchasedQty - assigned);
                  return (
                    <button
                      key={license.id}
                      onClick={() => setSelectedId(license.id)}
                      className={cn('grid w-full grid-cols-[minmax(0,1fr)_110px_100px] items-center gap-3 px-4 py-3 text-left hover:bg-slate-50', selectedId === license.id && 'bg-blue-50 ring-1 ring-inset ring-blue-200')}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2"><span className="truncate font-semibold text-slate-900">{license.swName}</span><span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">{license.category}</span></div>
                        <div className="mt-1 text-xs text-slate-500">v{license.version} · {ASSIGN_LABEL[license.assignUnit]} · 만료 {license.expireDate}</div>
                      </div>
                      <div className="text-center text-xs"><div className="font-semibold text-slate-900">{assigned} / {license.purchasedQty} {quantityUnit(license.assignUnit)}</div><div className="text-[10px] text-slate-400">할당 / 계약</div></div>
                      <div className="text-right"><span className={cn('rounded-full px-2 py-1 text-xs font-semibold', available > 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700')}>잔여 {available}개</span></div>
                    </button>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </section>

        <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border bg-white shadow-sm">
          {!selected ? (
            <div className="flex h-full flex-col items-center justify-center px-8 text-center">
              <ShieldCheck className="mb-3 h-10 w-10 text-slate-300" />
              <p className="font-medium text-slate-700">라이선스를 선택하세요.</p>
              <p className="mt-1 text-sm text-slate-400">구매·할당 현황과 실제 할당 장비를 확인할 수 있습니다.</p>
            </div>
          ) : (
            <>
              <div className="border-b bg-slate-900 px-4 py-4 text-white">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0"><div className="text-xs text-slate-400">{CATEGORY[selected.category].label}</div><h2 className="mt-0.5 truncate text-lg font-bold">{selected.swName}</h2><div className="mt-1 text-xs text-slate-400">v{selected.version} · {ASSIGN_LABEL[selected.assignUnit]}</div></div>
                  <Button size="sm" variant="secondary" onClick={() => startEdit(selected)}><Pencil className="mr-1 h-3.5 w-3.5" />수정</Button>
                </div>
              </div>
              <ScrollArea className="min-h-0 flex-1">
                <div className="space-y-5 p-4">
                  <div className="grid grid-cols-3 gap-2">
                    <Stat label="계약" value={`${selected.purchasedQty}${quantityUnit(selected.assignUnit)}`} />
                    <Stat label="할당" value={`${usedQuantity}${quantityUnit(selected.assignUnit)}`} />
                    <Stat label="잔여" value={`${remaining}${quantityUnit(selected.assignUnit)}`} accent={remaining > 0} />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Info label="만료일" value={selected.expireDate} />
                    <Info label="할당 기준" value={ASSIGN_LABEL[selected.assignUnit]} />
                    {selected.assignUnit === 'CORE' && <Info label="라이선스 코어 단위" value={`1단위당 ${selected.corePackSize ?? 1}코어`} />}
                    <div className="col-span-2"><Info label="라이선스 키" value={maskKey(selected.licenseKey)} /></div>
                  </div>

                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">할당 자산</h3>
                      <Button size="sm" disabled={remaining <= 0} onClick={() => { setAssignQuantity(String(selected.assignUnit === 'CORE' ? selected.corePackSize ?? 1 : 1)); setAssignOpen(true); }}><CheckCircle2 className="mr-1 h-3.5 w-3.5" />자산에 할당</Button>
                    </div>
                    {assignmentsForSelected.length === 0 ? (
                      <div className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-slate-400">할당 이력이 없습니다.</div>
                    ) : (
                      <div className="space-y-2">
                        {[...assignmentsForSelected].sort((a, b) => b.assignedAt.localeCompare(a.assignedAt)).map((assignment) => {
                          const device = assignment.deviceId ? deviceById.get(assignment.deviceId) : null;
                          return (
                            <div key={assignment.id} className={cn('rounded-lg border p-3', assignment.revokedAt && 'bg-slate-50 opacity-65')}>
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0"><div className="truncate text-sm font-semibold">{device?.deviceName ?? `장비 #${assignment.deviceId}`}</div><div className="mt-0.5 text-[11px] text-slate-500">{device?.assetNo ?? '자산번호 미확인'} · {assignment.assignedAt.slice(0, 10)} · {assignmentUsage(assignment)}{selected.assignUnit === 'CORE' ? '코어' : selected.assignUnit === 'PROCESSOR' ? '소켓' : '개'}</div></div>
                                {assignment.revokedAt ? <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] text-slate-500">회수됨</span> : <Button size="sm" variant="outline" onClick={() => revokeLicense.mutate(assignment)} disabled={revokeLicense.isPending}><Undo2 className="mr-1 h-3 w-3" />회수</Button>}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </ScrollArea>
            </>
          )}
        </section>
      </div>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader><DialogTitle>{editing ? '라이선스 정보 수정' : '신규 라이선스 등록'}</DialogTitle><DialogDescription>구매 계약서와 라이선스 증서를 기준으로 입력하세요.</DialogDescription></DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2">
            <FormField label="제품명 *"><Input value={form.swName} onChange={(event) => setForm({ ...form, swName: event.target.value })} placeholder="예: Windows Server Standard" /></FormField>
            <FormField label="버전 *"><Input value={form.version} onChange={(event) => setForm({ ...form, version: event.target.value })} placeholder="예: 2025" /></FormField>
            <FormField label="분류 *"><select className="h-9 w-full rounded-md border bg-white px-3 text-sm" value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value as LicenseCategory })}><option value="OS">운영체제(OS)</option><option value="SOFTWARE">업무·관리 소프트웨어</option></select></FormField>
            <FormField label="할당 단위 *"><select className="h-9 w-full rounded-md border bg-white px-3 text-sm" value={form.assignUnit} onChange={(event) => setForm({ ...form, assignUnit: event.target.value as AssignUnit })}><option value="NODE">장비(노드) 단위</option><option value="AGENT">에이전트 설치 단위</option><option value="PROCESSOR">프로세서(소켓) 단위</option><option value="CORE">물리 코어 단위</option></select></FormField>
            <FormField label={`${contractQuantityLabel(form.assignUnit)} *`}>
              <Input
                type="number"
                min={Math.max(1, usedByEditing)}
                step={1}
                value={form.purchasedQty}
                onChange={(event) => setForm({ ...form, purchasedQty: event.target.value })}
                placeholder={form.assignUnit === 'CORE' ? '예: 4' : undefined}
              />
              {form.assignUnit === 'CORE' && (
                <p className="mt-1 text-[11px] text-slate-500">
                  계약서에 명시된 총 물리 코어 수를 입력하세요. 예: 4코어 계약이면 4
                </p>
              )}
            </FormField>
            {form.assignUnit === 'CORE' && (
              <FormField label="라이선스 1단위당 적용 코어 수 *">
                <Input
                  type="number"
                  min={1}
                  step={1}
                  value={form.corePackSize}
                  onChange={(event) => setForm({ ...form, corePackSize: event.target.value })}
                  placeholder="예: 4"
                />
                <p className="mt-1 text-[11px] text-slate-500">예: 4를 입력하면 자산 할당 시 4, 8, 12코어 단위로 적용합니다.</p>
              </FormField>
            )}
            {form.assignUnit === 'CORE' && Number(form.corePackSize) > 0 && Number(form.purchasedQty) % Number(form.corePackSize) !== 0 && (
              <p className="col-span-2 text-xs text-red-600">계약 코어 수는 라이선스 적용 코어 단위의 배수여야 합니다.</p>
            )}
            <FormField label="만료일 *"><Input type="date" value={form.expireDate} onChange={(event) => setForm({ ...form, expireDate: event.target.value })} /></FormField>
            <div className="col-span-2"><FormField label="라이선스 키 *"><Input value={form.licenseKey} onChange={(event) => setForm({ ...form, licenseKey: event.target.value })} placeholder="라이선스 키 또는 계약 식별번호" /></FormField></div>
            {editing && usedByEditing > 0 && <div className="col-span-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">현재 {usedByEditing}{quantityUnit(form.assignUnit)}가 할당되어 있어 계약 수량을 그보다 작게 변경할 수 없습니다.</div>}
            {(saveLicense.error || deleteLicense.error) && <p className="col-span-2 text-sm text-red-600">{(saveLicense.error ?? deleteLicense.error)?.message}</p>}
          </div>
          <DialogFooter className="sm:justify-between">
            <div>{editing && <Button variant="destructive" disabled={usedByEditing > 0 || deleteLicense.isPending} title={usedByEditing > 0 ? '할당 중인 라이선스는 삭제할 수 없습니다.' : '삭제'} onClick={() => confirm(`"${editing.swName}" 라이선스를 삭제할까요?`) && deleteLicense.mutate(editing)}><Trash2 className="mr-1 h-4 w-4" />삭제</Button>}</div>
            <div className="flex gap-2"><Button variant="outline" onClick={() => setFormOpen(false)}>취소</Button><Button disabled={!validForm || Number(form.purchasedQty) < usedByEditing || saveLicense.isPending} onClick={() => saveLicense.mutate()}>{editing ? '수정' : '등록'}</Button></div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>{selected?.swName} 자산 할당</DialogTitle><DialogDescription>장비 ID가 아닌 자산명과 자산번호를 확인해 할당합니다. 잔여 수량: {remaining}{selected ? quantityUnit(selected.assignUnit) : '개'}</DialogDescription></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="relative"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" /><Input value={deviceSearch} onChange={(event) => setDeviceSearch(event.target.value)} className="pl-9" placeholder="장비명, 자산번호, 모델 검색" /></div>
            <FormField label="할당 대상 자산 *">
              <select className="h-10 w-full rounded-md border bg-white px-3 text-sm" value={assignDeviceId} onChange={(event) => { setAssignDeviceId(event.target.value); setAssignQuantity(String(corePackSize)); }}>
                <option value="">자산을 선택하세요</option>
                {availableDevices.map((device) => <option key={device.id} value={device.id}>{device.deviceName} · {device.assetNo ?? '자산번호 없음'} · {device.modelName ?? '-'}</option>)}
              </select>
            </FormField>
            {selectedAssignDevice && (
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
                <div className="text-xs font-bold text-blue-900">선택 자산 라이선스 현황</div>
                <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded bg-white px-2 py-2"><div className="text-[10px] text-slate-500">총 물리 코어</div><div className="text-sm font-bold">{deviceTotalCoreCount || '-'}</div></div>
                  <div className="rounded bg-white px-2 py-2"><div className="text-[10px] text-slate-500">라이선스 적용 코어</div><div className="text-sm font-bold text-blue-700">{deviceAppliedCoreCount}</div></div>
                  <div className="rounded bg-white px-2 py-2"><div className="text-[10px] text-slate-500">유휴 코어</div><div className="text-sm font-bold text-emerald-700">{deviceTotalCoreCount ? deviceIdleCoreCount : '-'}</div></div>
                </div>
                <div className="mt-2 space-y-1">
                  {deviceActiveAssignments.length === 0 ? (
                    <p className="text-[11px] text-slate-500">현재 할당된 라이선스가 없습니다.</p>
                  ) : deviceActiveAssignments.map((assignment) => {
                    const license = licenseById.get(assignment.licenseId);
                    return (
                      <div key={assignment.id} className="flex items-center justify-between rounded bg-white px-2.5 py-1.5 text-[11px]">
                        <span className="truncate font-medium text-slate-700">{license?.swName ?? `라이선스 #${assignment.licenseId}`}</span>
                        <span className="ml-2 shrink-0 text-slate-500">
                          {license ? ASSIGN_LABEL[license.assignUnit] : '할당'} · {assignmentUsage(assignment)}{license ? quantityUnit(license.assignUnit) : '개'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            {selected && ['CORE', 'PROCESSOR'].includes(selected.assignUnit) && (
              <FormField label={selected.assignUnit === 'CORE' ? '라이선스 적용 코어 수 *' : '라이선스 적용 프로세서(소켓) 수 *'}>
                <Input
                  type="number"
                  min={selected.assignUnit === 'CORE' ? corePackSize : 1}
                  max={maxAssignableQuantity}
                  step={selected.assignUnit === 'CORE' ? corePackSize : 1}
                  value={assignQuantity}
                  onChange={(event) => setAssignQuantity(event.target.value)}
                />
                {selected.assignUnit === 'CORE' && <p className="mt-1 text-[11px] text-slate-500">적용 단위: {corePackSize}코어 · 최대 적용 가능: {maxAssignableQuantity}코어</p>}
              </FormField>
            )}
            {availableDevices.length === 0 && <div className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">검색 조건에 맞는 미할당 자산이 없습니다.</div>}
            {assignLicense.error && <p className="text-sm text-red-600">{assignLicense.error.message}</p>}
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setAssignOpen(false)}>취소</Button><Button disabled={!assignDeviceId || Number(assignQuantity) < 1 || Number(assignQuantity) > maxAssignableQuantity || (selected?.assignUnit === 'CORE' && Number(assignQuantity) % corePackSize !== 0) || remaining <= 0 || assignLicense.isPending} onClick={() => assignLicense.mutate()}>라이선스 할당</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CategoryButton({ active, label, description, icon: Icon, onClick }: { active: boolean; label: string; description: string; icon: typeof MonitorCog; onClick: () => void }) {
  return <button onClick={onClick} className={cn('flex w-full items-start gap-3 rounded-lg px-3 py-3 text-left hover:bg-slate-100', active && 'bg-blue-50 text-blue-900 ring-1 ring-inset ring-blue-200')}><Icon className={cn('mt-0.5 h-4 w-4 shrink-0', active ? 'text-blue-700' : 'text-slate-400')} /><span className="min-w-0"><span className="block text-sm font-semibold">{label}</span><span className="mt-0.5 block truncate text-[10px] text-slate-500">{description}</span></span></button>;
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return <div className={cn('rounded-lg border bg-slate-50 px-3 py-2 text-center', accent && 'border-emerald-200 bg-emerald-50')}><div className="text-[10px] text-slate-400">{label}</div><div className={cn('mt-0.5 text-base font-bold text-slate-800', accent && 'text-emerald-700')}>{value}</div></div>;
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border bg-slate-50 px-3 py-2"><div className="text-[10px] text-slate-400">{label}</div><div className="mt-0.5 truncate text-sm font-semibold text-slate-800">{value}</div></div>;
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>;
}
