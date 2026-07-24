'use client';

import type { UseMutationResult } from '@tanstack/react-query';
import { FileSpreadsheet, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { ImportRow, ProductModelRow } from './types';

export function ImportDialog({
  open,
  onOpenChange,
  importRows,
  importFileName,
  companyById,
  importErrors,
  importModels,
  onReselectFile,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  importRows: ImportRow[];
  importFileName: string;
  companyById: Map<number, string>;
  importErrors: number;
  importModels: UseMutationResult<ProductModelRow[], Error, void>;
  onReselectFile: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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
          <Button variant="outline" onClick={onReselectFile}>다른 파일 선택</Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>취소</Button>
          <Button disabled={!importRows.length || importErrors > 0 || importModels.isPending} onClick={() => importModels.mutate()}>
            {importModels.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}{importRows.length}건 전체 반영
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
