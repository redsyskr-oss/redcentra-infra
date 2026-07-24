'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, Loader2, Pencil, Plus, Search, Trash2, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface Company {
  id: number;
  companyName: string;
  businessNumber?: string | null;
  phone?: string | null;
}

interface CompanyUser {
  id: number;
  companyId?: number | null;
}

async function errorMessage(res: Response, fallback: string) {
  try {
    const data = await res.json();
    return data.message ?? data.error ?? fallback;
  } catch {
    return fallback;
  }
}

export default function CompanyManage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Company | null>(null);
  const [companyName, setCompanyName] = useState('');
  const [businessNumber, setBusinessNumber] = useState('');
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  const { data: companies = [], isLoading, isError } = useQuery<Company[]>({
    queryKey: ['companies-admin'],
    queryFn: async () => {
      const res = await fetch('/api/v1/companies');
      if (!res.ok) throw new Error(await errorMessage(res, '회사 목록을 불러오지 못했습니다.'));
      return res.json();
    },
  });

  const { data: users = [] } = useQuery<CompanyUser[]>({
    queryKey: ['users-company-count'],
    queryFn: async () => {
      const res = await fetch('/api/v1/users');
      return res.ok ? res.json() : [];
    },
  });

  const userCounts = useMemo(() => {
    const counts = new Map<number, number>();
    users.forEach((user) => {
      if (user.companyId != null) counts.set(Number(user.companyId), (counts.get(Number(user.companyId)) ?? 0) + 1);
    });
    return counts;
  }, [users]);

  const filtered = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return companies;
    return companies.filter((company) =>
      [company.companyName, company.businessNumber, company.phone].some((value) => value?.toLowerCase().includes(keyword)),
    );
  }, [companies, search]);

  const saveCompany = useMutation({
    mutationFn: async () => {
      const name = companyName.trim();
      if (!name) throw new Error('회사명을 입력해 주세요.');
      const res = await fetch(editing ? `/api/v1/companies/${editing.id}` : '/api/v1/companies', {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyName: name,
          businessNumber: businessNumber.trim() || null,
          phone: phone.trim() || null,
        }),
      });
      if (!res.ok) throw new Error(await errorMessage(res, editing ? '회사 정보 수정에 실패했습니다.' : '회사 등록에 실패했습니다.'));
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['companies-admin'] });
      await queryClient.invalidateQueries({ queryKey: ['user'] });
      setFormOpen(false);
      setEditing(null);
      setMessage(editing ? '회사 정보를 수정했습니다.' : '회사를 등록했습니다.');
    },
    onError: (error) => setMessage(error instanceof Error ? error.message : '회사 정보 저장에 실패했습니다.'),
  });

  const deleteCompany = useMutation({
    mutationFn: async (company: Company) => {
      const count = userCounts.get(Number(company.id)) ?? 0;
      if (count > 0) throw new Error(`소속 사용자가 ${count}명 있어 삭제할 수 없습니다.`);
      const res = await fetch(`/api/v1/companies/${company.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(await errorMessage(res, '회사 삭제에 실패했습니다.'));
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['companies-admin'] });
      setMessage('회사를 삭제했습니다.');
    },
    onError: (error) => setMessage(error instanceof Error ? error.message : '회사 삭제에 실패했습니다.'),
  });

  function startEdit(company: Company) {
    setMessage(null);
    setEditing(company);
    setCompanyName(company.companyName);
    setBusinessNumber(company.businessNumber ?? '');
    setPhone(company.phone ?? '');
    setFormOpen(true);
  }

  function startCreate() {
    setMessage(null);
    setEditing(null);
    setCompanyName('');
    setBusinessNumber('');
    setPhone('');
    setFormOpen(true);
  }

  function handleDelete(company: Company) {
    setMessage(null);
    if (confirm(`“${company.companyName}” 회사를 삭제할까요?\n삭제한 회사는 복구할 수 없습니다.`)) {
      deleteCompany.mutate(company);
    }
  }

  return (
    <div className="flex h-full flex-col gap-4 overflow-auto p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold"><Building2 className="h-5 w-5 text-[#123E78]" />회사 관리</h1>
          <p className="mt-1 text-sm text-muted-foreground">회사를 등록하고 기본정보를 수정하거나 사용하지 않는 회사를 삭제합니다.</p>
        </div>
        <Button onClick={startCreate}><Plus className="mr-1 h-4 w-4" />회사 등록</Button>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" placeholder="회사명, 사업자번호, 전화번호 검색" />
      </div>

      {message && <div className="rounded-md border bg-muted/40 px-4 py-2 text-sm">{message}</div>}

      <div className="overflow-hidden rounded-lg border bg-white">
        <div className="grid grid-cols-[minmax(180px,1fr)_180px_160px_100px_120px] gap-3 border-b bg-muted/50 px-4 py-2.5 text-xs font-semibold text-muted-foreground">
          <span>회사명</span><span>사업자번호</span><span>전화번호</span><span>소속 인원</span><span className="text-right">관리</span>
        </div>
        {isLoading && <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />불러오는 중...</div>}
        {isError && <div className="py-16 text-center text-sm text-destructive">회사 목록을 불러오지 못했습니다.</div>}
        {!isLoading && !isError && filtered.length === 0 && <div className="py-16 text-center text-sm text-muted-foreground">표시할 회사가 없습니다.</div>}
        {filtered.map((company) => {
          const count = userCounts.get(Number(company.id)) ?? 0;
          return (
            <div key={company.id} className="grid grid-cols-[minmax(180px,1fr)_180px_160px_100px_120px] items-center gap-3 border-b px-4 py-3 text-sm last:border-0 hover:bg-muted/20">
              <span className="font-semibold">{company.companyName}</span>
              <span className="text-muted-foreground">{company.businessNumber || '-'}</span>
              <span className="text-muted-foreground">{company.phone || '-'}</span>
              <span className="flex items-center gap-1.5"><Users className="h-3.5 w-3.5 text-muted-foreground" />{count}명</span>
              <span className="flex justify-end gap-1">
                <Button size="icon" variant="ghost" className="h-8 w-8" title="회사명 변경" onClick={() => startEdit(company)}><Pencil className="h-4 w-4" /></Button>
                <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" title={count ? '소속 사용자가 있어 삭제할 수 없습니다' : '회사 삭제'} disabled={count > 0 || deleteCompany.isPending} onClick={() => handleDelete(company)}><Trash2 className="h-4 w-4" /></Button>
              </span>
            </div>
          );
        })}
      </div>

      <Dialog open={formOpen} onOpenChange={(open) => { setFormOpen(open); if (!open) setEditing(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? '회사 정보 수정' : '회사 등록'}</DialogTitle>
            <DialogDescription>{editing ? '회사명, 사업자번호와 전화번호를 변경합니다.' : '새 회사의 기본정보를 입력해 주세요.'}</DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); saveCompany.mutate(); }} className="space-y-4">
            <div className="grid gap-2"><Label htmlFor="company-name">회사명</Label><Input id="company-name" value={companyName} onChange={(e) => setCompanyName(e.target.value)} autoFocus maxLength={100} required /></div>
            <div className="grid gap-2"><Label htmlFor="business-number">사업자번호</Label><Input id="business-number" value={businessNumber} onChange={(e) => setBusinessNumber(e.target.value)} placeholder="000-00-00000" maxLength={20} /></div>
            <div className="grid gap-2"><Label htmlFor="company-phone">전화번호</Label><Input id="company-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="02-0000-0000" maxLength={30} /></div>
            <DialogFooter><Button type="button" variant="outline" onClick={() => setFormOpen(false)}>취소</Button><Button type="submit" disabled={saveCompany.isPending || !companyName.trim()}>{saveCompany.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}{editing ? '수정' : '등록'}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
