'use client';

import { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as XLSX from 'xlsx-js-style';
import {
  Building2,
  ChevronRight,
  Download,
  FileSpreadsheet,
  FolderPlus,
  HardDrive,
  Loader2,
  MoreHorizontal,
  Package,
  Pencil,
  Plus,
  Search,
  Trash2,
  Upload,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { useTabStore } from '@/store/useTabStore';

interface Category {
  id: number;
  parentId: number | null;
  name: string;
  depth: number;
}

type EquipmentType = 'SERVER' | 'SWITCH' | 'BACKBONE' | 'FIREWALL' | 'IPS' | 'DDOS' | 'L4' | 'WAF' | 'PDU' | 'ETC';
type PortLayout = 'SINGLE_ROW' | 'DOUBLE_ROW' | 'MODULAR';

interface ProductModelRow {
  id: number;
  categoryId: number;
  vendor: string;
  modelName: string;
  uSize: number;
  powerWatt: number;
  equipmentType?: EquipmentType;
  portCount?: number;
  portLayout?: PortLayout;
  imageUrl?: string | null;
  supplierCompanyId?: number | null;
  deliveryDate?: string | null;
  deliveryQuantity?: number | null;
  contractNumber?: string | null;
  cpuSocketCount?: number | null;
  coresPerSocket?: number | null;
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

interface Device {
  id: number;
  productModelId?: number | null;
  modelName?: string | null;
  deviceName: string;
  assetNo?: string | null;
  serialNumber?: string | null;
  introDate?: string | null;
  companyId?: number | null;
  rackId?: number | null;
  status: string;
}

interface Company {
  id: number;
  companyName: string;
}

interface ModelForm {
  categoryId: string;
  vendor: string;
  modelName: string;
  uSize: string;
  powerWatt: string;
  equipmentType: EquipmentType;
  portCount: string;
  portLayout: PortLayout;
  portPrefix: string;
  portType: string;
  portRole: string;
  supplierCompanyId: string;
  deliveryDate: string;
  deliveryQuantity: string;
  contractNumber: string;
  cpuSocketCount: string;
  coresPerSocket: string;
  memoryGb: string;
}

interface ImportRow extends ModelForm {
  rowNumber: number;
  categoryName: string;
  errors: string[];
}

const EMPTY_MODEL: ModelForm = {
  categoryId: '',
  vendor: '',
  modelName: '',
  uSize: '1',
  powerWatt: '0',
  equipmentType: 'SERVER',
  portCount: '',
  portLayout: 'DOUBLE_ROW',
  portPrefix: 'eth',
  portType: 'RJ45',
  portRole: 'DATA',
  supplierCompanyId: '',
  deliveryDate: '',
  deliveryQuantity: '1',
  contractNumber: '',
  cpuSocketCount: '1',
  coresPerSocket: '8',
  memoryGb: '32',
};

const EQUIPMENT_LABEL: Record<EquipmentType, string> = {
  SERVER: '서버',
  SWITCH: '스위치',
  BACKBONE: '백본',
  FIREWALL: '방화벽',
  IPS: 'IPS',
  DDOS: 'DDoS',
  L4: 'L4 스위치',
  WAF: '웹방화벽',
  PDU: 'PDU',
  ETC: '기타',
};

const STATUS_LABEL: Record<string, string> = {
  OPERATING: '운영',
  STANDBY: '대기',
  DISPOSED: '폐기',
};

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.message ?? payload?.error ?? '요청을 처리하지 못했습니다.');
  }
  return response.status === 204 ? (undefined as T) : response.json();
}

function categoryPath(categoryId: number, categories: Category[]) {
  const names: string[] = [];
  let current = categories.find((category) => category.id === categoryId);
  while (current) {
    names.unshift(current.name);
    current = current.parentId == null ? undefined : categories.find((category) => category.id === current?.parentId);
  }
  return names.join(' > ') || '미분류';
}

function CategoryNode({
  category,
  categories,
  selectedId,
  modelCount,
  onSelect,
  onEdit,
  depth = 0,
}: {
  category: Category;
  categories: Category[];
  selectedId: number | null;
  modelCount: Map<number, number>;
  onSelect: (id: number) => void;
  onEdit: (category: Category) => void;
  depth?: number;
}) {
  const children = categories.filter((item) => item.parentId === category.id);
  return (
    <div>
      <div
        className={cn(
          'group flex items-center rounded-lg pr-1 transition-colors hover:bg-slate-100',
          selectedId === category.id && 'bg-blue-50 text-blue-800',
        )}
      >
        <button
          onClick={() => onSelect(category.id)}
          className="flex min-w-0 flex-1 items-center gap-1.5 py-2 text-left text-sm"
          style={{ paddingLeft: `${depth * 14 + 10}px` }}
        >
          {children.length > 0 ? <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-400" /> : <span className="w-3.5" />}
          <span className="truncate">{category.name}</span>
          <span className="ml-auto rounded-full bg-slate-100 px-1.5 text-[10px] text-slate-500">{modelCount.get(category.id) ?? 0}</span>
        </button>
        <button
          className="ml-1 rounded p-1 text-slate-400 opacity-0 hover:bg-white hover:text-slate-700 group-hover:opacity-100"
          onClick={() => onEdit(category)}
          title="분류 수정·삭제"
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </div>
      {children.map((child) => (
        <CategoryNode
          key={child.id}
          category={child}
          categories={categories}
          selectedId={selectedId}
          modelCount={modelCount}
          onSelect={onSelect}
          onEdit={onEdit}
          depth={depth + 1}
        />
      ))}
    </div>
  );
}

export default function ProductModel({ data: _data }: { data?: unknown }) {
  void _data;
  const queryClient = useQueryClient();
  const openTab = useTabStore((state) => state.openTab);
  const importRef = useRef<HTMLInputElement>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [selectedModelId, setSelectedModelId] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [modelOpen, setModelOpen] = useState(false);
  const [editingModel, setEditingModel] = useState<ProductModelRow | null>(null);
  const [modelForm, setModelForm] = useState<ModelForm>(EMPTY_MODEL);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [categoryName, setCategoryName] = useState('');
  const [categoryParentId, setCategoryParentId] = useState('');
  const [importOpen, setImportOpen] = useState(false);
  const [importRows, setImportRows] = useState<ImportRow[]>([]);
  const [importFileName, setImportFileName] = useState('');
  const [message, setMessage] = useState('');

  const { data: categories = [], isLoading: loadingCategories } = useQuery<Category[]>({
    queryKey: ['categories'],
    queryFn: () => api('/api/v1/categories'),
  });
  const { data: models = [], isLoading: loadingModels } = useQuery<ProductModelRow[]>({
    queryKey: ['productModels'],
    queryFn: () => api('/api/v1/productModels'),
  });
  const { data: portTemplates = [] } = useQuery<PortTemplate[]>({
    queryKey: ['portTemplates'],
    queryFn: () => api('/api/v1/portTemplates'),
  });
  const { data: devices = [] } = useQuery<Device[]>({
    queryKey: ['devices', 'model-delivery'],
    queryFn: () => api('/api/v1/devices'),
  });
  const { data: companies = [] } = useQuery<Company[]>({
    queryKey: ['companies-admin'],
    queryFn: () => api('/api/v1/companies'),
  });

  const roots = categories.filter((category) => category.parentId == null);
  const modelCount = useMemo(() => {
    const counts = new Map<number, number>();
    models.forEach((model) => counts.set(model.categoryId, (counts.get(model.categoryId) ?? 0) + 1));
    return counts;
  }, [models]);
  const keyword = search.trim().toLowerCase();
  const visibleModels = models.filter((model) => {
    if (selectedCategoryId != null && model.categoryId !== selectedCategoryId) return false;
    if (!keyword) return true;
    return `${model.vendor} ${model.modelName} ${EQUIPMENT_LABEL[model.equipmentType ?? 'ETC']} ${categoryPath(model.categoryId, categories)}`
      .toLowerCase()
      .includes(keyword);
  });
  const selectedModel = models.find((model) => model.id === selectedModelId) ?? null;
  const selectedDevices = selectedModel
    ? devices.filter((device) => device.productModelId === selectedModel.id || (!device.productModelId && device.modelName === selectedModel.modelName))
    : [];
  const companyById = new Map(companies.map((company) => [company.id, company.companyName]));
  const templatesForModel = portTemplates.filter((template) => template.productModelId === selectedModelId);
  const resolvedPortCount = (model: ProductModelRow) => {
    if (model.portCount) return model.portCount;
    const count = portTemplates
      .filter((template) => template.productModelId === model.id)
      .reduce((sum, template) => sum + Math.floor((template.endIndex - template.startIndex) / Math.max(1, template.indexStep)) + 1, 0);
    return count || null;
  };

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['categories'] }),
      queryClient.invalidateQueries({ queryKey: ['productModels'] }),
    ]);
  };

  const saveCategory = useMutation({
    mutationFn: async () => {
      const parent = categories.find((category) => category.id === Number(categoryParentId));
      const body = {
        name: categoryName.trim(),
        parentId: categoryParentId ? Number(categoryParentId) : null,
        depth: parent ? parent.depth + 1 : 1,
      };
      return api(editingCategory ? `/api/v1/categories/${editingCategory.id}` : '/api/v1/categories', {
        method: editingCategory ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    },
    onSuccess: async () => {
      await refresh();
      setCategoryOpen(false);
      setMessage(editingCategory ? '분류를 수정했습니다.' : '새 분류를 등록했습니다.');
    },
  });

  const deleteCategory = useMutation({
    mutationFn: (category: Category) => api(`/api/v1/categories/${category.id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      if (editingCategory?.id === selectedCategoryId) setSelectedCategoryId(null);
      await refresh();
      setCategoryOpen(false);
      setMessage('분류를 삭제했습니다.');
    },
  });

  const saveModel = useMutation({
    mutationFn: async () => {
      const body = {
        categoryId: Number(modelForm.categoryId),
        vendor: modelForm.vendor.trim(),
        modelName: modelForm.modelName.trim(),
        uSize: Number(modelForm.uSize),
        powerWatt: Number(modelForm.powerWatt),
        equipmentType: modelForm.equipmentType,
        portCount: modelForm.portCount ? Number(modelForm.portCount) : null,
        portLayout: modelForm.portCount ? modelForm.portLayout : null,
        imageUrl: editingModel?.imageUrl ?? null,
        supplierCompanyId: modelForm.supplierCompanyId ? Number(modelForm.supplierCompanyId) : null,
        deliveryDate: modelForm.deliveryDate || null,
        deliveryQuantity: modelForm.supplierCompanyId ? Number(modelForm.deliveryQuantity || 1) : null,
        contractNumber: modelForm.contractNumber.trim() || null,
        cpuSocketCount: modelForm.equipmentType === 'SERVER' ? Number(modelForm.cpuSocketCount) : null,
        coresPerSocket: modelForm.equipmentType === 'SERVER' ? Number(modelForm.coresPerSocket) : null,
        totalCoreCount: modelForm.equipmentType === 'SERVER' ? Number(modelForm.cpuSocketCount) * Number(modelForm.coresPerSocket) : null,
        memoryGb: modelForm.equipmentType === 'SERVER' ? Number(modelForm.memoryGb) : null,
      };
      const saved = await api<ProductModelRow>(editingModel ? `/api/v1/productModels/${editingModel.id}` : '/api/v1/productModels', {
        method: editingModel ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const existingTemplates = portTemplates.filter((template) => template.productModelId === saved.id);
      if (modelForm.portCount) {
        const startIndex = modelForm.portPrefix.toLowerCase().startsWith('eth') ? 0 : 1;
        const templateBody = {
          productModelId: saved.id,
          portPrefix: modelForm.portPrefix.trim(),
          startIndex,
          endIndex: startIndex + Number(modelForm.portCount) - 1,
          indexStep: 1,
          zeroPadding: 0,
          portType: modelForm.portType,
          portRole: modelForm.portRole,
        };
        if (existingTemplates[0]) {
          await api(`/api/v1/portTemplates/${existingTemplates[0].id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(templateBody),
          });
        } else {
          await api('/api/v1/portTemplates', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(templateBody),
          });
        }
        await Promise.all(existingTemplates.slice(1).map((template) => api(`/api/v1/portTemplates/${template.id}`, { method: 'DELETE' })));
      } else {
        await Promise.all(existingTemplates.map((template) => api(`/api/v1/portTemplates/${template.id}`, { method: 'DELETE' })));
      }
      return saved;
    },
    onSuccess: async (saved) => {
      await refresh();
      await queryClient.invalidateQueries({ queryKey: ['portTemplates'] });
      setSelectedModelId(saved.id);
      setModelOpen(false);
      setMessage(editingModel ? '모델 정보를 수정했습니다.' : '새 모델을 등록했습니다.');
    },
  });

  const deleteModel = useMutation({
    mutationFn: (model: ProductModelRow) => api(`/api/v1/productModels/${model.id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      setSelectedModelId(null);
      await refresh();
      setModelOpen(false);
      setMessage('모델을 삭제했습니다.');
    },
  });

  const importModels = useMutation({
    mutationFn: async () => {
      const created: ProductModelRow[] = [];
      for (const row of importRows) {
        const model = await api<ProductModelRow>('/api/v1/productModels', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            categoryId: Number(row.categoryId),
            vendor: row.vendor,
            modelName: row.modelName,
            uSize: Number(row.uSize),
            powerWatt: Number(row.powerWatt),
            equipmentType: row.equipmentType,
            portCount: row.portCount ? Number(row.portCount) : null,
            portLayout: row.portCount ? row.portLayout : null,
            imageUrl: null,
            supplierCompanyId: row.supplierCompanyId ? Number(row.supplierCompanyId) : null,
            deliveryDate: row.deliveryDate || null,
            deliveryQuantity: row.supplierCompanyId ? Number(row.deliveryQuantity || 1) : null,
            contractNumber: row.contractNumber || null,
            cpuSocketCount: row.equipmentType === 'SERVER' ? Number(row.cpuSocketCount || 1) : null,
            coresPerSocket: row.equipmentType === 'SERVER' ? Number(row.coresPerSocket || 8) : null,
            totalCoreCount: row.equipmentType === 'SERVER' ? Number(row.cpuSocketCount || 1) * Number(row.coresPerSocket || 8) : null,
            memoryGb: row.equipmentType === 'SERVER' ? Number(row.memoryGb || 32) : null,
          }),
        });
        created.push(model);
        if (row.portCount) {
          const startIndex = row.portPrefix.toLowerCase().startsWith('eth') ? 0 : 1;
          await api('/api/v1/portTemplates', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              productModelId: model.id,
              portPrefix: row.portPrefix,
              startIndex,
              endIndex: startIndex + Number(row.portCount) - 1,
              indexStep: 1,
              zeroPadding: 0,
              portType: row.portType,
              portRole: row.portRole,
            }),
          });
        }
      }
      return created;
    },
    onSuccess: async () => {
      await refresh();
      await queryClient.invalidateQueries({ queryKey: ['portTemplates'] });
      setImportOpen(false);
      setMessage(`${importRows.length}개 모델을 일괄 등록했습니다.`);
    },
  });

  const startCategoryCreate = () => {
    setEditingCategory(null);
    setCategoryName('');
    setCategoryParentId(selectedCategoryId ? String(selectedCategoryId) : '');
    setCategoryOpen(true);
  };
  const startCategoryEdit = (category: Category) => {
    setEditingCategory(category);
    setCategoryName(category.name);
    setCategoryParentId(category.parentId == null ? '' : String(category.parentId));
    setCategoryOpen(true);
  };
  const startModelCreate = () => {
    setEditingModel(null);
    setModelForm({ ...EMPTY_MODEL, categoryId: selectedCategoryId ? String(selectedCategoryId) : '' });
    setModelOpen(true);
  };
  const startModelEdit = (model: ProductModelRow) => {
    const linkedAssets = devices.filter((device) => (
      device.productModelId === model.id || (!device.productModelId && device.modelName === model.modelName)
    ));
    if (linkedAssets.length > 0) {
      setMessage(`실제 자산 ${linkedAssets.length}대가 확정된 모델은 수정할 수 없습니다.`);
      return;
    }
    const template = portTemplates.find((item) => item.productModelId === model.id);
    setEditingModel(model);
    setModelForm({
      categoryId: String(model.categoryId),
      vendor: model.vendor,
      modelName: model.modelName,
      uSize: String(model.uSize),
      powerWatt: String(model.powerWatt),
      equipmentType: model.equipmentType ?? 'ETC',
      portCount: model.portCount ? String(model.portCount) : '',
      portLayout: model.portLayout ?? 'DOUBLE_ROW',
      portPrefix: template?.portPrefix ?? 'eth',
      portType: template?.portType ?? 'RJ45',
      portRole: template?.portRole ?? 'DATA',
      supplierCompanyId: model.supplierCompanyId ? String(model.supplierCompanyId) : '',
      deliveryDate: model.deliveryDate ?? '',
      deliveryQuantity: String(model.deliveryQuantity ?? 1),
      contractNumber: model.contractNumber ?? '',
      cpuSocketCount: String(model.cpuSocketCount ?? 1),
      coresPerSocket: String(model.coresPerSocket ?? 8),
      memoryGb: String(model.memoryGb ?? 32),
    });
    setModelOpen(true);
  };

  const downloadTemplate = () => {
    const rows = [
      ['분류 경로*', '제조사*', '모델명*', '장비 구분*', '높이(U)*', '소비전력(W)', 'CPU 소켓 수', '소켓당 코어 수', '메모리(GB)', '포트 수', '포트 배치', '포트 접두어', '포트 종류', '포트 용도', '납품업체', '납품일', '납품수량', '계약번호'],
      ['서버 > 랙마운트 서버', 'Dell', 'PowerEdge R760', 'SERVER', 2, 800, 2, 24, 256, 4, 'SINGLE_ROW', 'eth', 'RJ45', 'DATA', '협력업체 A', '2026-07-23', 10, '계약-2026-001'],
      ['네트워크장비 > L3 스위치', 'Cisco', 'Catalyst 9300', 'SWITCH', 1, 715, '', '', '', 48, 'DOUBLE_ROW', 'Gi1/0/', 'RJ45', 'DATA', '', '', '', ''],
    ];
    const sheet = XLSX.utils.aoa_to_sheet(rows);
    sheet['!cols'] = [28, 18, 28, 18, 12, 16, 14, 18, 12, 18, 16, 16, 16, 22, 15, 12, 20].map((wch) => ({ wch }));
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, '모델등록');
    XLSX.writeFile(book, '자산모델_일괄등록_양식.xlsx');
  };

  const readImport = async (file: File) => {
    const book = XLSX.read(await file.arrayBuffer(), { type: 'array' });
    const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(book.Sheets[book.SheetNames[0]], { defval: '' });
    const seen = new Set(models.map((model) => `${model.vendor}|${model.modelName}`.toLowerCase()));
    const rows: ImportRow[] = raw.map((item, index) => {
      const categoryName = String(item['분류 경로*'] || item['분류 경로'] || '').trim();
      const leafName = categoryName.split('>').at(-1)?.trim() ?? '';
      const category = categories.find((entry) => entry.name === leafName);
      const vendor = String(item['제조사*'] || item['제조사'] || '').trim();
      const modelName = String(item['모델명*'] || item['모델명'] || '').trim();
      const equipmentType = String(item['장비 구분*'] || item['장비 구분'] || 'ETC').toUpperCase() as EquipmentType;
      const uSize = String(item['높이(U)*'] || item['높이(U)'] || '');
      const powerWatt = String(item['소비전력(W)'] || '0');
      const portCount = String(item['포트 수'] || '');
      const portLayout = String(item['포트 배치'] || 'DOUBLE_ROW').toUpperCase() as PortLayout;
      const portPrefix = String(item['포트 접두어'] || 'eth').trim();
      const portType = String(item['포트 종류'] || 'RJ45').trim().toUpperCase();
      const portRole = String(item['포트 용도'] || 'DATA').trim().toUpperCase();
      const cpuSocketCount = String(item['CPU 소켓 수'] || '1');
      const coresPerSocket = String(item['소켓당 코어 수'] || '8');
      const memoryGb = String(item['메모리(GB)'] || '32');
      const supplierName = String(item['납품업체'] || '').trim();
      const supplier = companies.find((company) => company.companyName === supplierName);
      const deliveryDate = String(item['납품일'] || '').trim();
      const deliveryQuantity = String(item['납품수량'] || '1');
      const contractNumber = String(item['계약번호'] || '').trim();
      const errors: string[] = [];
      if (!category) errors.push('분류 경로를 확인하세요.');
      if (!vendor) errors.push('제조사가 필요합니다.');
      if (!modelName) errors.push('모델명이 필요합니다.');
      if (!Object.keys(EQUIPMENT_LABEL).includes(equipmentType)) errors.push('장비 구분 코드가 올바르지 않습니다.');
      if (!Number.isInteger(Number(uSize)) || Number(uSize) < 1 || Number(uSize) > 60) errors.push('높이는 1~60U 정수여야 합니다.');
      if (Number(powerWatt) < 0) errors.push('소비전력을 확인하세요.');
      if (portCount && (!Number.isInteger(Number(portCount)) || Number(portCount) < 1 || Number(portCount) > 128)) errors.push('포트 수는 1~128 정수여야 합니다.');
      if (portCount && !['SINGLE_ROW', 'DOUBLE_ROW', 'MODULAR'].includes(portLayout)) errors.push('포트 배치를 확인하세요.');
      if (portCount && !portPrefix) errors.push('포트 접두어가 필요합니다.');
      if (equipmentType === 'SERVER' && (!Number.isInteger(Number(cpuSocketCount)) || Number(cpuSocketCount) < 1)) errors.push('CPU 소켓 수를 확인하세요.');
      if (equipmentType === 'SERVER' && (!Number.isInteger(Number(coresPerSocket)) || Number(coresPerSocket) < 1)) errors.push('소켓당 코어 수를 확인하세요.');
      if (equipmentType === 'SERVER' && (!Number.isInteger(Number(memoryGb)) || Number(memoryGb) < 1)) errors.push('메모리 용량(GB)을 확인하세요.');
      if (supplierName && !supplier) errors.push('등록된 납품업체명이 아닙니다.');
      if (supplierName && !deliveryDate) errors.push('납품일이 필요합니다.');
      if (supplierName && (!Number.isInteger(Number(deliveryQuantity)) || Number(deliveryQuantity) < 1)) errors.push('납품수량을 확인하세요.');
      const key = `${vendor}|${modelName}`.toLowerCase();
      if (seen.has(key)) errors.push('이미 등록된 제조사·모델명입니다.');
      seen.add(key);
      return {
        rowNumber: index + 2,
        categoryName,
        categoryId: category ? String(category.id) : '',
        vendor,
        modelName,
        equipmentType,
        uSize,
        powerWatt,
        portCount,
        portLayout,
        portPrefix,
        portType,
        portRole,
        cpuSocketCount,
        coresPerSocket,
        memoryGb,
        supplierCompanyId: supplier ? String(supplier.id) : '',
        deliveryDate,
        deliveryQuantity,
        contractNumber,
        errors,
      };
    });
    setImportFileName(file.name);
    setImportRows(rows);
    setImportOpen(true);
  };

  const categoryHasChildren = editingCategory ? categories.some((category) => category.parentId === editingCategory.id) : false;
  const categoryInUse = editingCategory ? models.some((model) => model.categoryId === editingCategory.id) : false;
  const modelInUse = editingModel ? devices.some((device) => device.productModelId === editingModel.id || (!device.productModelId && device.modelName === editingModel.modelName)) : false;
  const importErrors = importRows.reduce((sum, row) => sum + (row.errors.length ? 1 : 0), 0);
  const deliveryValid = !modelForm.supplierCompanyId || (Boolean(modelForm.deliveryDate) && Number(modelForm.deliveryQuantity) >= 1);
  const portValid = !modelForm.portCount || (Boolean(modelForm.portPrefix.trim()) && Boolean(modelForm.portType) && Boolean(modelForm.portRole));
  const cpuValid = modelForm.equipmentType !== 'SERVER' || (Number(modelForm.cpuSocketCount) >= 1 && Number(modelForm.coresPerSocket) >= 1 && Number(modelForm.memoryGb) >= 1);
  const modelValid = modelForm.categoryId && modelForm.vendor.trim() && modelForm.modelName.trim() && Number(modelForm.uSize) > 0 && Number(modelForm.powerWatt) >= 0 && deliveryValid && portValid && cpuValid;

  return (
    <div className="flex h-full min-h-0 flex-col bg-slate-50/70">
      <header className="border-b bg-white px-5 py-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-2 text-xl font-bold text-slate-900"><Package className="h-5 w-5 text-blue-700" />자산 모델·분류체계</h1>
            <p className="mt-1 text-sm text-slate-500">납품 전에 장비 분류와 표준 모델을 등록하고, 도입된 실제 장비 이력을 함께 확인합니다.</p>
          </div>
          <div className="flex gap-2">
            <input
              ref={importRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void readImport(file);
                event.target.value = '';
              }}
            />
            <Button variant="outline" onClick={downloadTemplate}><Download className="mr-1.5 h-4 w-4" />엑셀 양식</Button>
            <Button variant="outline" onClick={() => importRef.current?.click()}><Upload className="mr-1.5 h-4 w-4" />엑셀 일괄 등록</Button>
            <Button onClick={startModelCreate}><Plus className="mr-1.5 h-4 w-4" />신규 모델 등록</Button>
          </div>
        </div>
        {message && <div className="mt-3 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</div>}
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-[260px_minmax(420px,1fr)_380px] gap-3 p-3">
        <section className="flex min-h-0 flex-col rounded-xl border bg-white shadow-sm">
          <div className="flex items-center justify-between border-b px-3 py-3">
            <div>
              <div className="text-sm font-semibold text-slate-900">장비 분류</div>
              <div className="text-[11px] text-slate-500">업무에 맞게 단계별로 구성</div>
            </div>
            <Button size="sm" variant="outline" onClick={startCategoryCreate}><FolderPlus className="mr-1 h-3.5 w-3.5" />분류 추가</Button>
          </div>
          <ScrollArea className="min-h-0 flex-1">
            <div className="p-2">
              <button
                onClick={() => setSelectedCategoryId(null)}
                className={cn('mb-1 flex w-full items-center rounded-lg px-2.5 py-2 text-left text-sm hover:bg-slate-100', selectedCategoryId == null && 'bg-blue-50 font-semibold text-blue-800')}
              >
                전체 모델 <span className="ml-auto rounded-full bg-slate-100 px-2 text-[10px] text-slate-500">{models.length}</span>
              </button>
              {loadingCategories ? <Loader2 className="mx-auto mt-10 h-5 w-5 animate-spin text-slate-400" /> : roots.map((root) => (
                <CategoryNode key={root.id} category={root} categories={categories} selectedId={selectedCategoryId} modelCount={modelCount} onSelect={setSelectedCategoryId} onEdit={startCategoryEdit} />
              ))}
            </div>
          </ScrollArea>
        </section>

        <section className="flex min-h-0 flex-col rounded-xl border bg-white shadow-sm">
          <div className="flex items-center gap-3 border-b p-3">
            <div className="relative min-w-0 flex-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <Input value={search} onChange={(event) => setSearch(event.target.value)} className="pl-9" placeholder="제조사, 모델명, 장비 종류 검색" />
            </div>
            <span className="whitespace-nowrap text-xs text-slate-500">{visibleModels.length}개 모델</span>
          </div>
          <ScrollArea className="min-h-0 flex-1">
            <div className="divide-y">
              {loadingModels ? (
                <div className="flex h-48 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
              ) : visibleModels.length === 0 ? (
                <div className="flex h-64 flex-col items-center justify-center text-center">
                  <Package className="mb-3 h-10 w-10 text-slate-300" />
                  <p className="font-medium text-slate-700">등록된 모델이 없습니다.</p>
                  <p className="mt-1 text-sm text-slate-400">신규 모델 등록 또는 엑셀 일괄 등록을 이용하세요.</p>
                  <Button className="mt-4" size="sm" onClick={startModelCreate}><Plus className="mr-1 h-4 w-4" />모델 등록</Button>
                </div>
              ) : visibleModels.map((model) => {
                const count = devices.filter((device) => device.productModelId === model.id || (!device.productModelId && device.modelName === model.modelName)).length;
                return (
                  <button
                    key={model.id}
                    onClick={() => setSelectedModelId(model.id)}
                    className={cn('grid w-full grid-cols-[minmax(0,1fr)_100px_90px_72px] items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50', selectedModelId === model.id && 'bg-blue-50/80 ring-1 ring-inset ring-blue-200')}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-semibold text-slate-900">{model.modelName}</span>
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">{EQUIPMENT_LABEL[model.equipmentType ?? 'ETC']}</span>
                      </div>
                      <div className="mt-1 truncate text-xs text-slate-500">{model.vendor} · {categoryPath(model.categoryId, categories)}</div>
                    </div>
                    <div className="text-xs text-slate-600"><span className="font-semibold text-slate-900">{model.uSize}U</span> · {model.powerWatt}W</div>
                    <div className="text-xs text-slate-600">{resolvedPortCount(model) ? `${resolvedPortCount(model)}포트` : '포트 없음'}</div>
                    <div className="text-right"><span className="rounded-full bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700">{count}대 도입</span></div>
                  </button>
                );
              })}
            </div>
          </ScrollArea>
        </section>

        <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border bg-white shadow-sm">
          {!selectedModel ? (
            <div className="flex h-full flex-col items-center justify-center px-8 text-center">
              <HardDrive className="mb-3 h-10 w-10 text-slate-300" />
              <p className="font-medium text-slate-700">모델을 선택하세요.</p>
              <p className="mt-1 text-sm leading-5 text-slate-400">기본 사양과 납품업체, 도입일, 실제 자산 정보를 한 화면에서 확인할 수 있습니다.</p>
            </div>
          ) : (
            <>
              <div className="border-b bg-slate-900 px-4 py-4 text-white">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs text-slate-400">{selectedModel.vendor}</div>
                    <h2 className="mt-0.5 truncate text-lg font-bold">{selectedModel.modelName}</h2>
                    <div className="mt-2 text-xs text-slate-300">{categoryPath(selectedModel.categoryId, categories)}</div>
                  </div>
                  <div className="flex gap-2">
                    {selectedDevices.length === 0 ? (
                      <>
                        <Button
                          size="sm"
                          className="bg-blue-600 text-white hover:bg-blue-500"
                          onClick={() => openTab(`AST_ASSET_RECEIVE_${selectedModel.id}`, '자산 입고 등록', { action: 'receive', modelId: selectedModel.id, requestId: Date.now() }, 'PackageCheck')}
                        >
                          <Package className="mr-1 h-3.5 w-3.5" />이 모델로 자산 입고
                        </Button>
                        <Button size="sm" variant="secondary" onClick={() => startModelEdit(selectedModel)}><Pencil className="mr-1 h-3.5 w-3.5" />수정</Button>
                      </>
                    ) : (
                      <span className="rounded-md border border-emerald-400/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-300">
                        자산 확정 · 조회 전용
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <ScrollArea className="min-h-0 flex-1">
                <div className="space-y-5 p-4">
                  <div>
                    <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">표준 사양</h3>
                    <div className="grid grid-cols-2 gap-2">
                      <Info label="장비 구분" value={EQUIPMENT_LABEL[selectedModel.equipmentType ?? 'ETC']} />
                      <Info label="높이" value={`${selectedModel.uSize}U`} />
                      <Info label="소비전력" value={`${selectedModel.powerWatt}W`} />
                      <Info label="포트" value={resolvedPortCount(selectedModel) ? `${resolvedPortCount(selectedModel)}포트` : '-'} />
                      {selectedModel.equipmentType === 'SERVER' && <Info label="CPU 구성" value={`${selectedModel.cpuSocketCount ?? 1}소켓 × ${selectedModel.coresPerSocket ?? 0}코어`} />}
                      {selectedModel.equipmentType === 'SERVER' && <Info label="총 물리 코어" value={`${selectedModel.totalCoreCount ?? (selectedModel.cpuSocketCount ?? 1) * (selectedModel.coresPerSocket ?? 0)}코어`} />}
                      {selectedModel.equipmentType === 'SERVER' && <Info label="메모리" value={`${selectedModel.memoryGb ?? '-'}GB`} />}
                    </div>
                    {templatesForModel.length > 0 && (
                      <div className="mt-2 rounded-lg border bg-slate-50 p-2.5">
                        <div className="mb-1.5 text-[11px] font-semibold text-slate-500">포트 템플릿</div>
                        {templatesForModel.map((template) => (
                          <div key={template.id} className="flex justify-between py-1 text-xs">
                            <span className="font-mono">{template.portPrefix}{template.startIndex} ~ {template.portPrefix}{template.endIndex}</span>
                            <span className="text-slate-500">{template.portType} · {template.portRole}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">납품·도입 현황</h3>
                      <span className="text-xs font-semibold text-blue-700">실자산 {selectedDevices.length}대</span>
                    </div>
                    {selectedModel.supplierCompanyId && (
                      <div className="mb-2 rounded-lg border border-blue-200 bg-blue-50/70 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 text-xs font-bold text-blue-800"><Building2 className="h-3.5 w-3.5" />모델 등록 시 입력한 납품정보</div>
                          <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-blue-700">납품 등록</span>
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                          <div><span className="text-slate-400">납품업체</span><div className="mt-0.5 font-semibold text-slate-800">{companyById.get(selectedModel.supplierCompanyId) ?? '업체 정보 없음'}</div></div>
                          <div><span className="text-slate-400">납품일</span><div className="mt-0.5 font-semibold text-slate-800">{selectedModel.deliveryDate || '미등록'}</div></div>
                          <div><span className="text-slate-400">납품수량</span><div className="mt-0.5 font-semibold text-slate-800">{selectedModel.deliveryQuantity ?? 1}대</div></div>
                          <div><span className="text-slate-400">계약번호</span><div className="mt-0.5 font-semibold text-slate-800">{selectedModel.contractNumber || '미등록'}</div></div>
                        </div>
                      </div>
                    )}
                    {selectedDevices.length === 0 ? (
                      <div className="rounded-lg border border-dashed px-3 py-5 text-center">
                        <p className="text-sm text-slate-500">{selectedModel.supplierCompanyId ? '아직 자산번호가 발급된 실제 장비가 없습니다.' : '납품정보와 실제 장비가 아직 등록되지 않았습니다.'}</p>
                        <p className="mt-1 text-[11px] text-slate-400">{selectedModel.supplierCompanyId ? 'IT 자산 등록에서 이 모델을 선택하면 실자산 현황에 자동으로 연결됩니다.' : '모델 수정에서 납품업체와 납품일을 입력할 수 있습니다.'}</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {[...selectedDevices].sort((a, b) => (b.introDate ?? '').localeCompare(a.introDate ?? '')).map((device) => (
                          <div key={device.id} className="rounded-lg border p-3">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <div className="font-semibold text-slate-900">{device.deviceName}</div>
                                <div className="mt-0.5 text-[11px] text-slate-500">{device.assetNo || '자산번호 미등록'} · {device.serialNumber || '시리얼 미등록'}</div>
                              </div>
                              <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold', device.status === 'OPERATING' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600')}>
                                {STATUS_LABEL[device.status] ?? device.status}
                              </span>
                            </div>
                            <div className="mt-2 grid grid-cols-2 gap-2 border-t pt-2 text-xs">
                              <div><span className="text-slate-400">납품업체</span><div className="mt-0.5 flex items-center gap-1 font-medium"><Building2 className="h-3 w-3 text-slate-400" />{device.companyId ? companyById.get(device.companyId) ?? '업체 정보 없음' : '미등록'}</div></div>
                              <div><span className="text-slate-400">도입일</span><div className="mt-0.5 font-medium">{device.introDate || '미등록'}</div></div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </ScrollArea>
            </>
          )}
        </section>
      </div>

      <Dialog open={categoryOpen} onOpenChange={setCategoryOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingCategory ? '분류 수정' : '새 분류 등록'}</DialogTitle>
            <DialogDescription>상위 분류를 선택하면 하위 분류로 등록됩니다.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5"><Label>분류명 *</Label><Input value={categoryName} onChange={(event) => setCategoryName(event.target.value)} placeholder="예: UNIX 서버" /></div>
            <div className="space-y-1.5">
              <Label>상위 분류</Label>
              <select className="h-9 w-full rounded-md border bg-white px-3 text-sm" value={categoryParentId} onChange={(event) => setCategoryParentId(event.target.value)}>
                <option value="">최상위 분류</option>
                {categories.filter((category) => category.id !== editingCategory?.id && category.depth < 3).map((category) => (
                  <option key={category.id} value={category.id}>{categoryPath(category.id, categories)}</option>
                ))}
              </select>
            </div>
            {(saveCategory.error || deleteCategory.error) && <p className="text-sm text-red-600">{(saveCategory.error ?? deleteCategory.error)?.message}</p>}
          </div>
          <DialogFooter className="sm:justify-between">
            <div>
              {editingCategory && (
                <Button
                  variant="destructive"
                  disabled={categoryHasChildren || categoryInUse || deleteCategory.isPending}
                  title={categoryHasChildren ? '하위 분류가 있어 삭제할 수 없습니다.' : categoryInUse ? '사용 중인 모델이 있어 삭제할 수 없습니다.' : '분류 삭제'}
                  onClick={() => {
                    if (confirm(`"${editingCategory.name}" 분류를 삭제할까요?`)) deleteCategory.mutate(editingCategory);
                  }}
                >
                  <Trash2 className="mr-1 h-4 w-4" />삭제
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setCategoryOpen(false)}>취소</Button>
              <Button disabled={!categoryName.trim() || saveCategory.isPending} onClick={() => saveCategory.mutate()}>{saveCategory.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}{editingCategory ? '수정' : '등록'}</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={modelOpen} onOpenChange={setModelOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingModel ? '모델 정보 수정' : '신규 모델 등록'}</DialogTitle>
            <DialogDescription>여기에는 공통 사양을 등록합니다. 자산번호·시리얼번호·납품일은 IT 자산 등록 시 입력합니다.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 py-2">
            <FormField label="장비 분류 *">
              <select className="h-9 w-full rounded-md border bg-white px-3 text-sm" value={modelForm.categoryId} onChange={(event) => setModelForm({ ...modelForm, categoryId: event.target.value })}>
                <option value="">분류를 선택하세요</option>
                {categories.map((category) => <option key={category.id} value={category.id}>{categoryPath(category.id, categories)}</option>)}
              </select>
            </FormField>
            <FormField label="장비 구분 *">
              <select className="h-9 w-full rounded-md border bg-white px-3 text-sm" value={modelForm.equipmentType} onChange={(event) => setModelForm({ ...modelForm, equipmentType: event.target.value as EquipmentType })}>
                {Object.entries(EQUIPMENT_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </FormField>
            <FormField label="제조사 *"><Input value={modelForm.vendor} onChange={(event) => setModelForm({ ...modelForm, vendor: event.target.value })} placeholder="예: Dell, Cisco, 시큐아이" /></FormField>
            <FormField label="모델명 *"><Input value={modelForm.modelName} onChange={(event) => setModelForm({ ...modelForm, modelName: event.target.value })} placeholder="정확한 제조사 모델명" /></FormField>
            <FormField label="장비 높이(U) *"><Input type="number" min={1} max={60} value={modelForm.uSize} onChange={(event) => setModelForm({ ...modelForm, uSize: event.target.value })} /></FormField>
            <FormField label="소비전력(W) *"><Input type="number" min={0} value={modelForm.powerWatt} onChange={(event) => setModelForm({ ...modelForm, powerWatt: event.target.value })} /></FormField>
            {modelForm.equipmentType === 'SERVER' && (
              <>
                <FormField label="CPU 소켓(프로세서) 수 *"><Input type="number" min={1} max={16} value={modelForm.cpuSocketCount} onChange={(event) => setModelForm({ ...modelForm, cpuSocketCount: event.target.value })} /></FormField>
                <FormField label="소켓당 물리 코어 수 *"><Input type="number" min={1} max={256} value={modelForm.coresPerSocket} onChange={(event) => setModelForm({ ...modelForm, coresPerSocket: event.target.value })} /></FormField>
                <FormField label="메모리 용량(GB) *"><Input type="number" min={1} value={modelForm.memoryGb} onChange={(event) => setModelForm({ ...modelForm, memoryGb: event.target.value })} /></FormField>
                <div className="col-span-2 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-xs text-violet-800">
                  총 물리 코어: <strong>{Number(modelForm.cpuSocketCount || 0) * Number(modelForm.coresPerSocket || 0)}코어</strong> · 프로세서 라이선스는 소켓 수, 코어 라이선스는 할당 코어 수만큼 차감됩니다.
                </div>
              </>
            )}
            <FormField label="포트 수">
              <select className="h-9 w-full rounded-md border bg-white px-3 text-sm" value={modelForm.portCount} onChange={(event) => setModelForm({ ...modelForm, portCount: event.target.value })}>
                <option value="">포트 없음</option>
                {['SWITCH', 'BACKBONE'].includes(modelForm.equipmentType)
                  ? <><option value="16">16포트</option><option value="24">24포트</option><option value="48">48포트</option></>
                  : <><option value="2">2포트</option><option value="4">4포트</option><option value="8">8포트</option><option value="16">16포트</option></>}
              </select>
            </FormField>
            <FormField label="포트 배치">
              <select disabled={!modelForm.portCount} className="h-9 w-full rounded-md border bg-white px-3 text-sm disabled:bg-slate-100" value={modelForm.portLayout} onChange={(event) => setModelForm({ ...modelForm, portLayout: event.target.value as PortLayout })}>
                <option value="SINGLE_ROW">1열</option><option value="DOUBLE_ROW">2열</option><option value="MODULAR">모듈형</option>
              </select>
            </FormField>
            {modelForm.portCount && (
              <>
                <div className="col-span-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
                  저장하면 <strong>{modelForm.portPrefix}{modelForm.portPrefix.toLowerCase().startsWith('eth') ? '0' : '1'}</strong>부터 총 <strong>{modelForm.portCount}개</strong>의 실제 포트 템플릿이 자동 생성됩니다.
                </div>
                <FormField label="포트 이름 규칙 *">
                  <Input value={modelForm.portPrefix} onChange={(event) => setModelForm({ ...modelForm, portPrefix: event.target.value })} placeholder="서버: eth / 스위치: Gi1/0/" />
                </FormField>
                <FormField label="포트 종류 *">
                  <select className="h-9 w-full rounded-md border bg-white px-3 text-sm" value={modelForm.portType} onChange={(event) => setModelForm({ ...modelForm, portType: event.target.value })}>
                    <option value="RJ45">RJ45</option><option value="SFP">SFP</option><option value="SFP_PLUS">SFP+</option><option value="QSFP">QSFP</option><option value="FC">Fibre Channel</option>
                  </select>
                </FormField>
                <FormField label="포트 용도 *">
                  <select className="h-9 w-full rounded-md border bg-white px-3 text-sm" value={modelForm.portRole} onChange={(event) => setModelForm({ ...modelForm, portRole: event.target.value })}>
                    <option value="DATA">데이터</option><option value="UPLINK">업링크</option><option value="MANAGEMENT">관리</option><option value="STORAGE">스토리지</option><option value="HA">HA</option>
                  </select>
                </FormField>
                <div className="rounded-lg border bg-slate-50 px-3 py-2 text-xs text-slate-600">
                  예시: {modelForm.portPrefix}{modelForm.portPrefix.toLowerCase().startsWith('eth') ? '0' : '1'} ~ {modelForm.portPrefix}{(modelForm.portPrefix.toLowerCase().startsWith('eth') ? 0 : 1) + Number(modelForm.portCount) - 1}
                </div>
              </>
            )}
            <div className="col-span-2 mt-1 border-t pt-3">
              <div className="text-sm font-semibold text-slate-800">최초 납품정보 <span className="font-normal text-slate-400">(선택)</span></div>
              <p className="mt-0.5 text-xs text-slate-500">모델과 함께 납품정보를 먼저 등록하고, 실제 장비는 이후 IT 자산 목록에서 자산번호별로 등록합니다.</p>
            </div>
            <FormField label="납품업체">
              <select className="h-9 w-full rounded-md border bg-white px-3 text-sm" value={modelForm.supplierCompanyId} onChange={(event) => setModelForm({ ...modelForm, supplierCompanyId: event.target.value })}>
                <option value="">납품업체를 선택하세요</option>
                {companies.map((company) => <option key={company.id} value={company.id}>{company.companyName}</option>)}
              </select>
            </FormField>
            <FormField label="납품일">
              <Input type="date" value={modelForm.deliveryDate} onChange={(event) => setModelForm({ ...modelForm, deliveryDate: event.target.value })} />
            </FormField>
            <FormField label="납품수량">
              <Input type="number" min={1} value={modelForm.deliveryQuantity} onChange={(event) => setModelForm({ ...modelForm, deliveryQuantity: event.target.value })} />
            </FormField>
            <FormField label="계약번호">
              <Input value={modelForm.contractNumber} onChange={(event) => setModelForm({ ...modelForm, contractNumber: event.target.value })} placeholder="예: 계약-2026-001" />
            </FormField>
            {(saveModel.error || deleteModel.error) && <p className="col-span-2 text-sm text-red-600">{(saveModel.error ?? deleteModel.error)?.message}</p>}
          </div>
          <DialogFooter className="sm:justify-between">
            <div>
              {editingModel && (
                <Button
                  variant="destructive"
                  disabled={modelInUse || deleteModel.isPending}
                  title={modelInUse ? '실제 자산에서 사용 중인 모델은 삭제할 수 없습니다.' : '모델 삭제'}
                  onClick={() => {
                    if (confirm(`"${editingModel.modelName}" 모델을 삭제할까요?`)) deleteModel.mutate(editingModel);
                  }}
                >
                  <Trash2 className="mr-1 h-4 w-4" />삭제
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setModelOpen(false)}>취소</Button>
              <Button disabled={!modelValid || saveModel.isPending} onClick={() => saveModel.mutate()}>{saveModel.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}{editingModel ? '수정' : '등록'}</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><FileSpreadsheet className="h-5 w-5 text-emerald-700" />모델 엑셀 일괄 등록</DialogTitle>
            <DialogDescription>모든 행이 검증을 통과해야만 일괄 반영됩니다. 파일: {importFileName}</DialogDescription>
          </DialogHeader>
          <div className={cn('rounded-lg px-3 py-2 text-sm', importErrors ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700')}>
            총 {importRows.length}건 · 정상 {importRows.length - importErrors}건 · 오류 {importErrors}건 {importErrors > 0 && '— 오류를 수정한 뒤 파일을 다시 선택하세요.'}
          </div>
          <ScrollArea className="h-80 rounded-lg border">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-slate-100 text-slate-600">
                <tr><th className="p-2 text-left">행</th><th className="p-2 text-left">분류</th><th className="p-2 text-left">제조사</th><th className="p-2 text-left">모델명</th><th className="p-2 text-left">구분</th><th className="p-2 text-left">U/전력</th><th className="p-2 text-left">납품정보</th><th className="p-2 text-left">검증 결과</th></tr>
              </thead>
              <tbody>
                {importRows.map((row) => (
                  <tr key={row.rowNumber} className="border-t">
                    <td className="p-2">{row.rowNumber}</td><td className="p-2">{row.categoryName}</td><td className="p-2">{row.vendor}</td><td className="p-2 font-medium">{row.modelName}</td><td className="p-2">{row.equipmentType}</td><td className="p-2">{row.uSize}U / {row.powerWatt}W</td><td className="p-2">{row.supplierCompanyId ? `${companyById.get(Number(row.supplierCompanyId)) ?? '-'} · ${row.deliveryDate} · ${row.deliveryQuantity}대` : '-'}</td>
                    <td className={cn('p-2', row.errors.length ? 'text-red-600' : 'text-emerald-700')}>{row.errors.length ? row.errors.join(' ') : '정상'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollArea>
          {importModels.error && <p className="text-sm text-red-600">{importModels.error.message}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => importRef.current?.click()}>다른 파일 선택</Button>
            <Button variant="outline" onClick={() => setImportOpen(false)}>취소</Button>
            <Button disabled={!importRows.length || importErrors > 0 || importModels.isPending} onClick={() => importModels.mutate()}>
              {importModels.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}{importRows.length}건 전체 반영
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border bg-slate-50 px-3 py-2"><div className="text-[10px] text-slate-400">{label}</div><div className="mt-0.5 text-sm font-semibold text-slate-800">{value}</div></div>;
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>;
}
