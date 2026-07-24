'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as XLSX from 'xlsx-js-style';
import {
  Building2,
  Download,
  FolderPlus,
  HardDrive,
  Loader2,
  Package,
  Pencil,
  Plus,
  Search,
  Upload,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { useTabStore } from '@/store/useTabStore';
import {
  Category, Company, Device, EMPTY_MODEL, EQUIPMENT_LABEL, EquipmentType, ImportRow,
  ModelForm, PortLayout, PortTemplate, ProductModelRow, STATUS_LABEL, api, categoryPath,
} from './product-model/types';
import { CategoryNode } from './product-model/CategoryTree';
import { CategoryDialog } from './product-model/CategoryDialog';
import { ModelDialog } from './product-model/ModelDialog';
import { ImportDialog } from './product-model/ImportDialog';

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
  const handleReceiveAsset = useCallback(() => {
    if (!selectedModel) return;
    openTab(`AST_ASSET_RECEIVE_${selectedModel.id}`, '자산 입고 등록', { action: 'receive', modelId: selectedModel.id, requestId: Date.now() }, 'PackageCheck');
  }, [selectedModel, openTab]);
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
                          onClick={handleReceiveAsset}
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


      <CategoryDialog
        open={categoryOpen}
        onOpenChange={setCategoryOpen}
        editingCategory={editingCategory}
        categories={categories}
        categoryName={categoryName}
        onCategoryNameChange={setCategoryName}
        categoryParentId={categoryParentId}
        onCategoryParentIdChange={setCategoryParentId}
        categoryHasChildren={categoryHasChildren}
        categoryInUse={categoryInUse}
        saveCategory={saveCategory}
        deleteCategory={deleteCategory}
      />

      <ModelDialog
        open={modelOpen}
        onOpenChange={setModelOpen}
        editingModel={editingModel}
        categories={categories}
        companies={companies}
        modelForm={modelForm}
        onModelFormChange={setModelForm}
        modelValid={modelValid}
        modelInUse={modelInUse}
        saveModel={saveModel}
        deleteModel={deleteModel}
      />

      <ImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        importRows={importRows}
        importFileName={importFileName}
        companyById={companyById}
        importErrors={importErrors}
        importModels={importModels}
        onReselectFile={() => importRef.current?.click()}
      />
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border bg-slate-50 px-3 py-2"><div className="text-[10px] text-slate-400">{label}</div><div className="mt-0.5 text-sm font-semibold text-slate-800">{value}</div></div>;
}
