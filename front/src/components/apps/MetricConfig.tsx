'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { CheckCircle2, Loader2, PlugZap } from 'lucide-react';
import { DataTable } from '@/components/common/DataTable';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

/** 메트릭 수집관리 — UI-MON-002 (신규 제안: OOB Redfish/IPMI/SNMP) */
interface MetricTarget {
  id: number;
  deviceId: number;
  deviceName: string;
  protocol: 'REDFISH' | 'IPMI' | 'SNMPV2C' | 'SNMPV3';
  address: string;
  port: number;
  intervalSec: number;
  status: 'NORMAL' | 'FAIL' | 'STOPPED';
  lastCollectedAt: string;
}

const STATUS_LABEL: Record<MetricTarget['status'], string> = { NORMAL: '정상', FAIL: '실패', STOPPED: '중지' };
const STATUS_COLOR: Record<MetricTarget['status'], string> = { NORMAL: 'text-emerald-600', FAIL: 'text-red-500', STOPPED: 'text-muted-foreground' };

export default function MetricConfig({ data: _data }: { data?: unknown }) {
  const [testingId, setTestingId] = useState<number | null>(null);
  const [testResult, setTestResult] = useState<Record<number, 'ok'>>({});

  const { data: targets = [] } = useQuery<MetricTarget[]>({
    queryKey: ['metricTargets'],
    queryFn: async () => {
      const res = await fetch('/api/v1/metricTargets?page=1&size=200');
      if (!res.ok) return [];
      const json = await res.json();
      return json.content ?? [];
    },
  });

  function testConnection(id: number) {
    setTestingId(id);
    setTimeout(() => {
      setTestingId(null);
      setTestResult((prev) => ({ ...prev, [id]: 'ok' }));
    }, 700);
  }

  const columns: ColumnDef<MetricTarget, unknown>[] = [
    { accessorKey: 'deviceName', header: '장비명' },
    { accessorKey: 'protocol', header: '프로토콜' },
    { accessorKey: 'address', header: '주소', cell: ({ row }) => `${row.original.address}:${row.original.port}` },
    { accessorKey: 'intervalSec', header: '수집 주기(초)' },
    {
      accessorKey: 'status',
      header: '상태',
      cell: (c) => <span className={STATUS_COLOR[c.getValue<MetricTarget['status']>()]}>{STATUS_LABEL[c.getValue<MetricTarget['status']>()]}</span>,
    },
    { accessorKey: 'lastCollectedAt', header: '최근 수집' },
    {
      id: 'test',
      header: '연결 테스트',
      cell: ({ row }) => (
        <Button size="sm" variant="outline" onClick={() => testConnection(row.original.id)} disabled={testingId === row.original.id}>
          {testingId === row.original.id ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : testResult[row.original.id] ? (
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
          ) : (
            <PlugZap className="h-3.5 w-3.5" />
          )}
        </Button>
      ),
    },
  ];

  return (
    <div className="flex h-full flex-col gap-3 p-4">
      <p className="text-xs text-muted-foreground">
        Redfish/IPMI/SNMP 기반 OOB(Out-of-Band) 메트릭 수집 설정입니다. 연결 테스트는 목업에서 항상 성공으로 처리됩니다.
      </p>
      <Card className="min-h-0 flex-1 flex-col overflow-hidden py-0">
        <CardContent className="flex h-full min-h-0 flex-col overflow-hidden p-3">
          <DataTable columns={columns} data={targets} />
        </CardContent>
      </Card>
    </div>
  );
}
