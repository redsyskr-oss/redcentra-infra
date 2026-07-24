'use client';

import type { UseMutationResult } from '@tanstack/react-query';
import { Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Category, categoryPath } from './types';

export function CategoryDialog({
  open,
  onOpenChange,
  editingCategory,
  categories,
  categoryName,
  onCategoryNameChange,
  categoryParentId,
  onCategoryParentIdChange,
  categoryHasChildren,
  categoryInUse,
  saveCategory,
  deleteCategory,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingCategory: Category | null;
  categories: Category[];
  categoryName: string;
  onCategoryNameChange: (value: string) => void;
  categoryParentId: string;
  onCategoryParentIdChange: (value: string) => void;
  categoryHasChildren: boolean;
  categoryInUse: boolean;
  saveCategory: UseMutationResult<unknown, Error, void>;
  deleteCategory: UseMutationResult<unknown, Error, Category>;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editingCategory ? '분류 수정' : '새 분류 등록'}</DialogTitle>
          <DialogDescription>상위 분류를 선택하면 하위 분류로 등록됩니다.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5"><Label>분류명 *</Label><Input value={categoryName} onChange={(event) => onCategoryNameChange(event.target.value)} placeholder="예: UNIX 서버" /></div>
          <div className="space-y-1.5">
            <Label>상위 분류</Label>
            <select className="h-9 w-full rounded-md border bg-white px-3 text-sm" value={categoryParentId} onChange={(event) => onCategoryParentIdChange(event.target.value)}>
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
            <Button variant="outline" onClick={() => onOpenChange(false)}>취소</Button>
            <Button disabled={!categoryName.trim() || saveCategory.isPending} onClick={() => saveCategory.mutate()}>{saveCategory.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}{editingCategory ? '수정' : '등록'}</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
