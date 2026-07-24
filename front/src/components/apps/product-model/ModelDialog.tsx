'use client';

import type { UseMutationResult } from '@tanstack/react-query';
import { Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Category, Company, EQUIPMENT_LABEL, EquipmentType, ModelForm, PortLayout, ProductModelRow,
  categoryPath,
} from './types';

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

export function ModelDialog({
  open,
  onOpenChange,
  editingModel,
  categories,
  companies,
  modelForm,
  onModelFormChange,
  modelValid,
  modelInUse,
  saveModel,
  deleteModel,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingModel: ProductModelRow | null;
  categories: Category[];
  companies: Company[];
  modelForm: ModelForm;
  onModelFormChange: (form: ModelForm) => void;
  modelValid: boolean | string;
  modelInUse: boolean;
  saveModel: UseMutationResult<ProductModelRow, Error, void>;
  deleteModel: UseMutationResult<unknown, Error, ProductModelRow>;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editingModel ? '모델 정보 수정' : '신규 모델 등록'}</DialogTitle>
          <DialogDescription>여기에는 공통 사양을 등록합니다. 자산번호·시리얼번호·납품일은 IT 자산 등록 시 입력합니다.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-x-4 gap-y-3 py-2">
          <FormField label="장비 분류 *">
            <select className="h-9 w-full rounded-md border bg-white px-3 text-sm" value={modelForm.categoryId} onChange={(event) => onModelFormChange({ ...modelForm, categoryId: event.target.value })}>
              <option value="">분류를 선택하세요</option>
              {categories.map((category) => <option key={category.id} value={category.id}>{categoryPath(category.id, categories)}</option>)}
            </select>
          </FormField>
          <FormField label="장비 구분 *">
            <select className="h-9 w-full rounded-md border bg-white px-3 text-sm" value={modelForm.equipmentType} onChange={(event) => onModelFormChange({ ...modelForm, equipmentType: event.target.value as EquipmentType })}>
              {Object.entries(EQUIPMENT_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </FormField>
          <FormField label="제조사 *"><Input value={modelForm.vendor} onChange={(event) => onModelFormChange({ ...modelForm, vendor: event.target.value })} placeholder="예: Dell, Cisco, 시큐아이" /></FormField>
          <FormField label="모델명 *"><Input value={modelForm.modelName} onChange={(event) => onModelFormChange({ ...modelForm, modelName: event.target.value })} placeholder="정확한 제조사 모델명" /></FormField>
          <FormField label="장비 높이(U) *"><Input type="number" min={1} max={60} value={modelForm.uSize} onChange={(event) => onModelFormChange({ ...modelForm, uSize: event.target.value })} /></FormField>
          <FormField label="소비전력(W) *"><Input type="number" min={0} value={modelForm.powerWatt} onChange={(event) => onModelFormChange({ ...modelForm, powerWatt: event.target.value })} /></FormField>
          {modelForm.equipmentType === 'SERVER' && (
            <>
              <FormField label="CPU 소켓(프로세서) 수 *"><Input type="number" min={1} max={16} value={modelForm.cpuSocketCount} onChange={(event) => onModelFormChange({ ...modelForm, cpuSocketCount: event.target.value })} /></FormField>
              <FormField label="소켓당 물리 코어 수 *"><Input type="number" min={1} max={256} value={modelForm.coresPerSocket} onChange={(event) => onModelFormChange({ ...modelForm, coresPerSocket: event.target.value })} /></FormField>
              <FormField label="메모리 용량(GB) *"><Input type="number" min={1} value={modelForm.memoryGb} onChange={(event) => onModelFormChange({ ...modelForm, memoryGb: event.target.value })} /></FormField>
              <div className="col-span-2 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-xs text-violet-800">
                총 물리 코어: <strong>{Number(modelForm.cpuSocketCount || 0) * Number(modelForm.coresPerSocket || 0)}코어</strong> · 프로세서 라이선스는 소켓 수, 코어 라이선스는 할당 코어 수만큼 차감됩니다.
              </div>
            </>
          )}
          <FormField label="포트 수">
            <select className="h-9 w-full rounded-md border bg-white px-3 text-sm" value={modelForm.portCount} onChange={(event) => onModelFormChange({ ...modelForm, portCount: event.target.value })}>
              <option value="">포트 없음</option>
              {['SWITCH', 'BACKBONE'].includes(modelForm.equipmentType)
                ? <><option value="16">16포트</option><option value="24">24포트</option><option value="48">48포트</option></>
                : <><option value="2">2포트</option><option value="4">4포트</option><option value="8">8포트</option><option value="16">16포트</option></>}
            </select>
          </FormField>
          <FormField label="포트 배치">
            <select disabled={!modelForm.portCount} className="h-9 w-full rounded-md border bg-white px-3 text-sm disabled:bg-slate-100" value={modelForm.portLayout} onChange={(event) => onModelFormChange({ ...modelForm, portLayout: event.target.value as PortLayout })}>
              <option value="SINGLE_ROW">1열</option><option value="DOUBLE_ROW">2열</option><option value="MODULAR">모듈형</option>
            </select>
          </FormField>
          {modelForm.portCount && (
            <>
              <div className="col-span-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
                저장하면 <strong>{modelForm.portPrefix}{modelForm.portPrefix.toLowerCase().startsWith('eth') ? '0' : '1'}</strong>부터 총 <strong>{modelForm.portCount}개</strong>의 실제 포트 템플릿이 자동 생성됩니다.
              </div>
              <FormField label="포트 이름 규칙 *">
                <Input value={modelForm.portPrefix} onChange={(event) => onModelFormChange({ ...modelForm, portPrefix: event.target.value })} placeholder="서버: eth / 스위치: Gi1/0/" />
              </FormField>
              <FormField label="포트 종류 *">
                <select className="h-9 w-full rounded-md border bg-white px-3 text-sm" value={modelForm.portType} onChange={(event) => onModelFormChange({ ...modelForm, portType: event.target.value })}>
                  <option value="RJ45">RJ45</option><option value="SFP">SFP</option><option value="SFP_PLUS">SFP+</option><option value="QSFP">QSFP</option><option value="FC">Fibre Channel</option>
                </select>
              </FormField>
              <FormField label="포트 용도 *">
                <select className="h-9 w-full rounded-md border bg-white px-3 text-sm" value={modelForm.portRole} onChange={(event) => onModelFormChange({ ...modelForm, portRole: event.target.value })}>
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
            <select className="h-9 w-full rounded-md border bg-white px-3 text-sm" value={modelForm.supplierCompanyId} onChange={(event) => onModelFormChange({ ...modelForm, supplierCompanyId: event.target.value })}>
              <option value="">납품업체를 선택하세요</option>
              {companies.map((company) => <option key={company.id} value={company.id}>{company.companyName}</option>)}
            </select>
          </FormField>
          <FormField label="납품일">
            <Input type="date" value={modelForm.deliveryDate} onChange={(event) => onModelFormChange({ ...modelForm, deliveryDate: event.target.value })} />
          </FormField>
          <FormField label="납품수량">
            <Input type="number" min={1} value={modelForm.deliveryQuantity} onChange={(event) => onModelFormChange({ ...modelForm, deliveryQuantity: event.target.value })} />
          </FormField>
          <FormField label="계약번호">
            <Input value={modelForm.contractNumber} onChange={(event) => onModelFormChange({ ...modelForm, contractNumber: event.target.value })} placeholder="예: 계약-2026-001" />
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
            <Button variant="outline" onClick={() => onOpenChange(false)}>취소</Button>
            <Button disabled={!modelValid || saveModel.isPending} onClick={() => saveModel.mutate()}>{saveModel.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}{editingModel ? '수정' : '등록'}</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
