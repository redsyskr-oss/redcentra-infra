'use client';

import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { DataTable } from '@/components/common/DataTable';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { apiFetch } from '@/lib/api';

/** AI 분석 현황 — UI-AI-001 (신규 제안: 배치 결과 조회 전용, 실시간 추론 없음) */
interface BatchHistory {
  id: number;
  startedAt: string;
  finishedAt: string | null;
  durationSec: number | null;
  targetCount: number;
  result: 'SUCCESS' | 'FAIL' | 'RUNNING';
  failReason: string | null;
}

interface AiResult {
  id: number;
  deviceName: string;
  analysisDate: string;
  anomalyScore: number;
  riskGrade: 'NORMAL' | 'CAUTION' | 'DANGER';
  topFactors: string;
  predictType: string;
  predictTarget: string;
  predictDate: string;
}

const GRADE_COLOR: Record<AiResult['riskGrade'], string> = {
  NORMAL: 'text-emerald-600',
  CAUTION: 'text-amber-500',
  DANGER: 'text-red-500',
};

export default function AiAnalysis({ data: _data }: { data?: unknown }) {
  const { data: batches = [] } = useQuery<BatchHistory[]>({
    queryKey: ['aiBatchHistory'],
    queryFn: async () => {
      const res = await apiFetch('/api/v1/aiBatchHistory');
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: results = [] } = useQuery<AiResult[]>({
    queryKey: ['aiResults'],
    queryFn: async () => {
      const res = await apiFetch('/api/v1/aiResults');
      if (!res.ok) return [];
      return res.json();
    },
  });

  const topRisk = [...results].sort((a, b) => b.anomalyScore - a.anomalyScore).slice(0, 5);

  const resultColumns: ColumnDef<AiResult, unknown>[] = [
    { accessorKey: 'deviceName', header: '장비명' },
    { accessorKey: 'anomalyScore', header: '이상탐지 점수' },
    { accessorKey: 'riskGrade', header: '위험등급', cell: (c) => <span className={GRADE_COLOR[c.getValue<AiResult['riskGrade']>()]}>{c.getValue<string>()}</span> },
    { accessorKey: 'topFactors', header: '주요 요인' },
    { accessorKey: 'predictType', header: '예측 유형' },
    { accessorKey: 'predictDate', header: '예측 시점' },
  ];

  const batchColumns: ColumnDef<BatchHistory, unknown>[] = [
    { accessorKey: 'startedAt', header: '시작' },
    { accessorKey: 'durationSec', header: '소요(초)', cell: (c) => c.getValue() ?? '-' },
    { accessorKey: 'targetCount', header: '대상 수' },
    {
      accessorKey: 'result',
      header: '결과',
      cell: (c) => {
        const v = c.getValue<string>();
        return <span className={cn(v === 'SUCCESS' ? 'text-emerald-600' : v === 'FAIL' ? 'text-red-500' : 'text-amber-500')}>{v}</span>;
      },
    },
    { accessorKey: 'failReason', header: '실패 사유', cell: (c) => c.getValue() ?? '-' },
  ];

  return (
    <div className="flex h-full flex-col gap-4 overflow-auto p-4">
      <p className="text-xs text-muted-foreground">
        야간 배치(InfluxDB → Spring Worker → Python FastAPI 추론 → MariaDB) 결과를 조회 전용으로 표시합니다.
      </p>

      <Card>
        <CardHeader><CardTitle className="text-sm">위험 장비 Top 5</CardTitle></CardHeader>
        <CardContent>
          <DataTable columns={resultColumns} data={topRisk} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-sm">배치 실행 이력</CardTitle></CardHeader>
        <CardContent>
          <DataTable columns={batchColumns} data={batches} />
        </CardContent>
      </Card>
    </div>
  );
}
