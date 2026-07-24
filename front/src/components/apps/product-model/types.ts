import { apiFetch } from '@/lib/api';

export interface Category {
  id: number;
  name: string;
  parentId: number | null;
  depth: number;
}

export type EquipmentType = 'SERVER' | 'SWITCH' | 'BACKBONE' | 'FIREWALL' | 'IPS' | 'DDOS' | 'L4' | 'WAF' | 'PDU' | 'ETC';
export type PortLayout = 'SINGLE_ROW' | 'DOUBLE_ROW' | 'MODULAR';

export interface ProductModelRow {
  id: number;
  categoryId: number;
  vendor: string;
  modelName: string;
  uSize: number;
  powerWatt: number;
  equipmentType: EquipmentType | null;
  portCount: number | null;
  portLayout: PortLayout | null;
  imageUrl: string | null;
  supplierCompanyId: number | null;
  deliveryDate: string | null;
  deliveryQuantity: number | null;
  contractNumber: string | null;
  cpuSocketCount: number | null;
  coresPerSocket: number | null;
  totalCoreCount: number | null;
  memoryGb: number | null;
}

export interface PortTemplate {
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

export interface Device {
  id: number;
  productModelId: number | null;
  modelName: string;
  deviceName: string;
  assetNo: string | null;
  serialNumber: string | null;
  status: string;
  companyId: number | null;
  introDate: string | null;
}

export interface Company {
  id: number;
  companyName: string;
}

export interface ModelForm {
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

export interface ImportRow extends ModelForm {
  rowNumber: number;
  categoryName: string;
  errors: string[];
}

export const EMPTY_MODEL: ModelForm = {
  categoryId: '', vendor: '', modelName: '', uSize: '1', powerWatt: '0', equipmentType: 'ETC',
  portCount: '', portLayout: 'DOUBLE_ROW', portPrefix: 'eth', portType: 'RJ45', portRole: 'DATA',
  supplierCompanyId: '', deliveryDate: '', deliveryQuantity: '1', contractNumber: '',
  cpuSocketCount: '1', coresPerSocket: '8', memoryGb: '32',
};

export const EQUIPMENT_LABEL: Record<EquipmentType, string> = {
  SERVER: '서버', SWITCH: '스위치', BACKBONE: '백본', FIREWALL: '방화벽', IPS: 'IPS',
  DDOS: 'DDoS 대응', L4: 'L4 스위치', WAF: 'WAF', PDU: 'PDU', ETC: '기타',
};

export const STATUS_LABEL: Record<string, string> = {
  OPERATING: '운영', STANDBY: '대기', DECOMMISSIONED: '폐기',
};

export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await apiFetch(url, init);
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.message ?? payload?.error ?? '요청을 처리하지 못했습니다.');
  }
  return response.status === 204 ? (undefined as T) : response.json();
}

export function categoryPath(categoryId: number, categories: Category[]) {
  const names: string[] = [];
  let current = categories.find((category) => category.id === categoryId);
  while (current) {
    names.unshift(current.name);
    current = current.parentId == null ? undefined : categories.find((category) => category.id === current?.parentId);
  }
  return names.join(' > ') || '미분류';
}
