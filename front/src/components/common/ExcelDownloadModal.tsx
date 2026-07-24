'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check, Download, FileSpreadsheet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import excelDownloaderStyled, { type ExcelRow, type ExcelSheetStyle } from '@/lib/excel/excelDownloadModuleStyled';

/** sms-front의 ExcelDownloadModal을 shadcn Dialog + Tailwind로 재작성 — 로직(단일/다중 시트, 12개
 * 컬러 테마, 컬럼 매핑)은 그대로 유지한다. */
export interface ExcelColumn<T = ExcelRow> {
  id: string;
  displayText: string;
  accessor?: keyof T | ((row: T) => unknown);
  formatter?: (value: unknown, row: T, index: number) => unknown;
  multisheet?: boolean;
}

interface ExcelDownloadModalProps<T> {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: T[] | (() => Promise<T[]>);
  excelColumns: ExcelColumn<T>[];
  title?: string;
  description?: string;
  defaultFileName?: string;
  groupByField?: string;
}

const STYLE_OPTIONS: (ExcelSheetStyle & { id: string; name: string })[] = [
  { id: 'style1', name: '클래식 블루', headerBg: '#4472C4', headerColor: 'white', evenRowBg: '#F2F2F2', oddRowBg: 'white' },
  { id: 'style2', name: '그린 테마', headerBg: '#70AD47', headerColor: 'white', evenRowBg: '#E2EFDA', oddRowBg: 'white' },
  { id: 'style3', name: '오렌지 테마', headerBg: '#ED7D31', headerColor: 'white', evenRowBg: '#FCE4D6', oddRowBg: 'white' },
  { id: 'style4', name: '퍼플 테마', headerBg: '#7030A0', headerColor: 'white', evenRowBg: '#E4DFEC', oddRowBg: 'white' },
  { id: 'style5', name: '레드 테마', headerBg: '#C5504B', headerColor: 'white', evenRowBg: '#F2DCDB', oddRowBg: 'white' },
  { id: 'style6', name: '다크 테마', headerBg: '#404040', headerColor: 'white', evenRowBg: '#E8E8E8', oddRowBg: 'white' },
  { id: 'style7', name: '티얼 테마', headerBg: '#0F6B68', headerColor: 'white', evenRowBg: '#DDEEDD', oddRowBg: 'white' },
  { id: 'style8', name: '로즈골드', headerBg: '#B87333', headerColor: 'white', evenRowBg: '#F5F0E8', oddRowBg: 'white' },
  { id: 'style9', name: '네이비 블루', headerBg: '#1F4E79', headerColor: 'white', evenRowBg: '#D9E2F3', oddRowBg: 'white' },
  { id: 'style10', name: '민트 그린', headerBg: '#00B7A8', headerColor: 'white', evenRowBg: '#E0F7F6', oddRowBg: 'white' },
  { id: 'style11', name: '심플 화이트', headerBg: '#FFFFFF', headerColor: '#333333', evenRowBg: '#F8F9FA', oddRowBg: 'white' },
  { id: 'style12', name: '그라데이션', headerBg: '#FF6B6B', headerColor: 'white', evenRowBg: '#FFE8E8', oddRowBg: 'white' },
];

const TABS = [
  { id: 'basic', label: '기본 설정' },
  { id: 'style', label: '스타일 선택' },
] as const;
type TabId = (typeof TABS)[number]['id'];

export default function ExcelDownloadModal<T>({
  open, onOpenChange, data, excelColumns,
  title = '엑셀 다운로드',
  description = '엑셀 파일로 다운로드합니다.',
  defaultFileName = '데이터',
  groupByField,
}: ExcelDownloadModalProps<T>) {
  const [tab, setTab] = useState<TabId>('basic');
  const [fileName, setFileName] = useState(defaultFileName);
  const [selectedStyleId, setSelectedStyleId] = useState('style1');
  const [selectedMultisheetColumn, setSelectedMultisheetColumn] = useState('');
  const [actualData, setActualData] = useState<T[]>([]);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const currentStyle = STYLE_OPTIONS.find((s) => s.id === selectedStyleId) ?? STYLE_OPTIONS[0];
  const multisheetColumns = useMemo(() => excelColumns.filter((c) => c.multisheet), [excelColumns]);

  useEffect(() => {
    if (!open) {
      setDataLoaded(false);
      setActualData([]);
      setFileName(defaultFileName);
      setTab('basic');
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    Promise.resolve(typeof data === 'function' ? data() : data)
      .then((rows) => { if (!cancelled) { setActualData(rows); setDataLoaded(true); } })
      .catch((err) => { console.error('데이터 로드 실패:', err); alert('데이터를 불러오는 중 오류가 발생했습니다.'); })
      .finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (selectedMultisheetColumn || multisheetColumns.length === 0) return;
    const defaultCol = multisheetColumns.find((c) => c.displayText === groupByField) ?? multisheetColumns[0];
    setSelectedMultisheetColumn(defaultCol.displayText);
  }, [multisheetColumns, groupByField, selectedMultisheetColumn]);

  const { headers, processedRows } = useMemo(() => {
    if (!actualData.length || !excelColumns.length) return { headers: [] as string[], processedRows: [] as ExcelRow[] };

    const hs = excelColumns.map((c) => c.displayText);
    const rows = actualData.map((row, index) => {
      const out: ExcelRow = {};
      excelColumns.forEach((col) => {
        let value: unknown = typeof col.accessor === 'function'
          ? col.accessor(row)
          : col.accessor
            ? row[col.accessor]
            : (row as Record<string, unknown>)[col.id];
        if (col.formatter) value = col.formatter(value, row, index);
        if (value == null) value = '';
        if (Array.isArray(value)) value = value.join(', ');
        else if (typeof value === 'object') value = JSON.stringify(value);
        out[col.displayText] = value;
      });
      return out;
    });
    return { headers: hs, processedRows: rows };
  }, [actualData, excelColumns]);

  const previewHeaders = headers.slice(0, 4);
  const previewRows = processedRows.slice(0, 3);

  async function handleDownload(type: 'data' | 'multisheet') {
    if (!fileName.trim()) { alert('파일명을 입력해주세요.'); return; }
    if (!processedRows.length) { alert('다운로드할 데이터가 없습니다.'); return; }

    setIsLoading(true);
    try {
      const style: ExcelSheetStyle = {
        headerBg: currentStyle.headerBg, headerColor: currentStyle.headerColor,
        evenRowBg: currentStyle.evenRowBg, oddRowBg: currentStyle.oddRowBg,
      };
      let success = false;

      if (type === 'data') {
        success = excelDownloaderStyled.downloadDataAsExcel({ data: processedRows, fileName, headers, style });
      } else {
        const sheets: { name: string; data: ExcelRow[]; headers: string[] }[] = [{ name: '전체데이터', data: processedRows, headers }];
        const targetField = selectedMultisheetColumn || groupByField;
        if (targetField) {
          const groupMap = new Map<string, ExcelRow[]>();
          for (const row of processedRows) {
            const raw = String(row[targetField] ?? '');
            const groups = raw && raw !== '미분류' && raw.trim() !== ''
              ? raw.split(',').map((g) => g.trim()).filter(Boolean)
              : ['미분류'];
            for (const g of groups) {
              if (!groupMap.has(g)) groupMap.set(g, []);
              groupMap.get(g)!.push(row);
            }
          }
          groupMap.forEach((groupData, groupName) => {
            if (groupData.length) sheets.push({ name: groupName.slice(0, 31), data: groupData, headers });
          });
        }
        success = excelDownloaderStyled.downloadMultiSheetExcel(sheets, fileName, style);
      }

      if (success) { alert('엑셀 다운로드가 완료되었습니다!'); onOpenChange(false); }
      else alert('다운로드 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[640px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4" /> {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="rounded-md border bg-muted/40 px-3 py-2 text-center text-sm">
          <span className="font-medium">데이터 정보: </span>
          <span className="text-muted-foreground">
            {isLoading && !dataLoaded ? '데이터 로딩 중...' : `총 ${actualData.length}건, ${excelColumns.length}개 컬럼`}
          </span>
        </div>

        <div className="flex gap-1 border-b">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                '-mb-px rounded-t-md border px-3 py-1.5 text-sm transition-colors',
                tab === t.id ? 'border-border border-b-background bg-background font-medium' : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'basic' ? (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>파일명</Label>
              <Input value={fileName} onChange={(e) => setFileName(e.target.value)} placeholder="파일명을 입력해주세요" />
            </div>

            {multisheetColumns.length > 0 && (
              <div className="space-y-1.5">
                <Label>다중시트 분할 기준</Label>
                <select
                  value={selectedMultisheetColumn}
                  onChange={(e) => setSelectedMultisheetColumn(e.target.value)}
                  className="h-9 w-full rounded-md border bg-transparent px-2.5 text-sm outline-none"
                >
                  {multisheetColumns.map((col) => (
                    <option key={col.id} value={col.displayText}>{col.displayText}별로 분할</option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">선택한 필드의 값에 따라 별도 시트로 분할됩니다.</p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <Button
                variant="outline"
                className="h-16 flex-col gap-1"
                disabled={isLoading || !processedRows.length}
                onClick={() => handleDownload('data')}
              >
                <span className="flex items-center gap-1.5 font-medium"><Download className="h-4 w-4" /> {isLoading ? '처리중...' : '스타일 엑셀'}</span>
                <span className="text-xs text-muted-foreground">선택한 스타일 적용 (단일 시트)</span>
              </Button>
              <Button
                variant="outline"
                className="h-16 flex-col gap-1"
                disabled={isLoading || !processedRows.length}
                onClick={() => handleDownload('multisheet')}
              >
                <span className="flex items-center gap-1.5 font-medium"><Download className="h-4 w-4" /> {isLoading ? '처리중...' : '다중시트'}</span>
                <span className="text-xs text-muted-foreground">{selectedMultisheetColumn ? `${selectedMultisheetColumn}별 분할` : '단일시트'}</span>
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <Label className="mb-2 block">스타일 선택</Label>
              <div className="grid grid-cols-4 gap-2.5">
                {STYLE_OPTIONS.map((style) => {
                  const selected = selectedStyleId === style.id;
                  return (
                    <button
                      key={style.id}
                      onClick={() => setSelectedStyleId(style.id)}
                      className={cn(
                        'relative rounded-lg border-2 p-1.5 text-center transition-transform',
                        selected ? 'scale-[1.02] shadow-[0_0_10px_rgba(0,0,0,.15)]' : 'border-border',
                      )}
                      style={{ borderColor: selected ? style.headerBg : undefined }}
                    >
                      <div
                        className={cn('mb-1.5 rounded px-2 py-1 text-[11px] font-bold', style.id === 'style11' && 'border')}
                        style={{ background: style.headerBg, color: style.headerColor }}
                      >
                        헤더
                      </div>
                      <div className="mb-1.5 flex h-4">
                        <div className="flex-1 border text-center text-[8px] leading-4" style={{ background: style.evenRowBg }}>1</div>
                        <div className="flex-1 border text-center text-[8px] leading-4" style={{ background: style.oddRowBg }}>2</div>
                      </div>
                      <div className="text-[10px] leading-tight" style={{ color: selected ? style.headerBg : undefined, fontWeight: selected ? 700 : 400 }}>
                        {style.name}
                      </div>
                      {selected && (
                        <span
                          className="absolute right-1 top-1 grid h-4 w-4 place-items-center rounded-full"
                          style={{ background: style.headerBg, color: style.headerColor }}
                        >
                          <Check className="h-2.5 w-2.5" />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <Label className="mb-2 block">미리보기</Label>
              <ScrollArea className="max-h-40 rounded-md border">
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{ background: currentStyle.headerBg, color: currentStyle.headerColor }}>
                      {previewHeaders.map((h) => (
                        <th key={h} className="border px-2 py-1.5 text-center">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.length === 0 ? (
                      <tr>
                        <td colSpan={Math.max(previewHeaders.length, 1)} className="bg-muted/40 px-2 py-5 text-center text-muted-foreground">
                          미리보기할 데이터가 없습니다.
                        </td>
                      </tr>
                    ) : (
                      previewRows.map((row, i) => (
                        <tr key={i} style={{ background: i % 2 === 0 ? currentStyle.oddRowBg : currentStyle.evenRowBg }}>
                          {previewHeaders.map((h) => (
                            <td key={h} className="border px-2 py-1 text-center">{String(row[h] ?? '-')}</td>
                          ))}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </ScrollArea>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
