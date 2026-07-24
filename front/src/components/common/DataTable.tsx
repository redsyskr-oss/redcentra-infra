'use client';

import {
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type OnChangeFn,
  type PaginationState,
  type RowSelectionState,
  type SortingState,
} from '@tanstack/react-table';
import { useMemo, useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { ArrowUpDown, ChevronFirst, ChevronLast, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

/**
 * 목록형 화면 공통 템플릿 (화면설계서: UI-BKP-001 레이아웃 준용)
 * - 헤더 클릭 정렬, 클라이언트 페이지네이션, 행 선택(+일괄작업), 로딩 스켈레톤을 지원한다.
 * - 백엔드가 전체 목록을 한 번에 내려주는 화면 구조를 전제로 페이지네이션은 클라이언트에서 처리한다.
 */
export function DataTable<T>({
  columns,
  data,
  emptyMessage = '데이터가 없습니다.',
  onRowClick,
  loading = false,
  pageSize = 20,
  enableRowSelection = false,
  rowSelection: controlledSelection,
  onRowSelectionChange,
  getRowId,
  bulkActions,
}: {
  columns: ColumnDef<T, unknown>[];
  data: T[];
  emptyMessage?: string;
  onRowClick?: (row: T) => void;
  /** true면 데이터 대신 스켈레톤 행을 표시한다. */
  loading?: boolean;
  /** 페이지당 행 수 (기본 20). data.length가 이보다 적으면 페이지네이션 컨트롤은 숨겨진다. */
  pageSize?: number;
  enableRowSelection?: boolean;
  rowSelection?: RowSelectionState;
  onRowSelectionChange?: OnChangeFn<RowSelectionState>;
  getRowId?: (row: T) => string;
  /** 선택된 행이 1개 이상일 때 헤더 위에 노출할 일괄작업 버튼 영역 */
  bulkActions?: (selectedRows: T[], clearSelection: () => void) => React.ReactNode;
}) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize });
  const [internalSelection, setInternalSelection] = useState<RowSelectionState>({});
  const rowSelection = controlledSelection ?? internalSelection;
  const setRowSelection = onRowSelectionChange ?? setInternalSelection;

  const tableColumns = useMemo<ColumnDef<T, unknown>[]>(() => {
    if (!enableRowSelection) return columns;
    const selectColumn: ColumnDef<T, unknown> = {
      id: '__select',
      size: 36,
      header: ({ table }) => (
        <Checkbox
          checked={table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() && 'indeterminate')}
          onCheckedChange={(v) => table.toggleAllPageRowsSelected(!!v)}
          aria-label="전체 선택"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(v) => row.toggleSelected(!!v)}
          onClick={(e) => e.stopPropagation()}
          aria-label="행 선택"
        />
      ),
      enableSorting: false,
    };
    return [selectColumn, ...columns];
  }, [columns, enableRowSelection]);

  const table = useReactTable({
    data,
    columns: tableColumns,
    state: { sorting, pagination, rowSelection },
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    onRowSelectionChange: setRowSelection,
    getRowId,
    enableRowSelection,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  const rows = table.getRowModel().rows;
  // table은 매 렌더마다 같은 참조를 유지하므로 실제로 바뀌는 rowSelection을 의존성으로 둬야 선택이 반영된다.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const selectedRows = useMemo(() => table.getSelectedRowModel().rows.map((r) => r.original), [rowSelection]);
  const pageCount = table.getPageCount();
  const totalRows = data.length;
  const showPagination = totalRows > 0 && (pageCount > 1 || PAGE_SIZE_OPTIONS.some((s) => s !== pagination.pageSize));

  return (
    <div className="flex h-full min-h-0 flex-col">
      {enableRowSelection && selectedRows.length > 0 && bulkActions && (
        <div className="mb-2 flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
          <span className="font-medium text-primary">{selectedRows.length}개 선택됨</span>
          <div className="ml-auto flex items-center gap-2">
            {bulkActions(selectedRows, () => setRowSelection({}))}
          </div>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-auto rounded-md border">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-card">
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id} className="hover:bg-transparent">
                {hg.headers.map((h) => (
                  <TableHead key={h.id} className="bg-card">
                    {h.isPlaceholder ? null : h.column.getCanSort() ? (
                      <button
                        className="inline-flex items-center gap-1 hover:text-foreground"
                        onClick={h.column.getToggleSortingHandler()}
                      >
                        {flexRender(h.column.columnDef.header, h.getContext())}
                        <ArrowUpDown className="h-3 w-3 opacity-50" />
                      </button>
                    ) : (
                      flexRender(h.column.columnDef.header, h.getContext())
                    )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: Math.min(pagination.pageSize, 8) }).map((_, i) => (
                <TableRow key={i} className="hover:bg-transparent">
                  {tableColumns.map((_, ci) => (
                    <TableCell key={ci}>
                      <Skeleton className="h-4 w-full max-w-32" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : rows.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell
                  colSpan={tableColumns.length}
                  className="h-24 text-center text-muted-foreground"
                >
                  {emptyMessage}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() ? 'selected' : undefined}
                  className={cn(onRowClick && 'cursor-pointer')}
                  onClick={() => onRowClick?.(row.original)}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className="whitespace-nowrap">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {showPagination && !loading && (
        <div className="flex shrink-0 items-center justify-between gap-3 border-t px-1 pt-2 text-sm text-muted-foreground">
          <div>
            총 {totalRows.toLocaleString()}건 중{' '}
            {pagination.pageIndex * pagination.pageSize + 1}
            –{Math.min((pagination.pageIndex + 1) * pagination.pageSize, totalRows)}
          </div>
          <div className="flex items-center gap-3">
            <select
              value={pagination.pageSize}
              onChange={(e) => table.setPageSize(Number(e.target.value))}
              className="h-8 rounded-md border bg-background px-2 text-xs"
            >
              {PAGE_SIZE_OPTIONS.map((size) => (
                <option key={size} value={size}>{size}개씩</option>
              ))}
            </select>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon-sm" onClick={() => table.setPageIndex(0)} disabled={!table.getCanPreviousPage()}>
                <ChevronFirst className="h-3.5 w-3.5" />
              </Button>
              <Button variant="outline" size="icon-sm" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <span className="px-2 text-xs tabular-nums">
                {pagination.pageIndex + 1} / {Math.max(pageCount, 1)}
              </span>
              <Button variant="outline" size="icon-sm" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
              <Button variant="outline" size="icon-sm" onClick={() => table.setPageIndex(pageCount - 1)} disabled={!table.getCanNextPage()}>
                <ChevronLast className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
