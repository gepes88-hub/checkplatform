import { Navigate, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Lock } from 'lucide-react';
import { supabase, q } from '../lib/supabase';
import { fmtDate } from '../lib/format';
import { STATUS_LABEL, type Diagnosis } from '../lib/types';
import { useSession } from '../state/session';
import { AppShell } from '../components/AppShell';
import { Card, ErrorBox, PageHeader, Pill, Spinner } from '../components/ui';

/** HCG 콘솔 — 모든 고객사 진단과 검수 대기 */
export default function Admin() {
  const { profile, loading } = useSession();
  const nav = useNavigate();
  const list = useQuery({
    queryKey: ['admin-diag'],
    enabled: Boolean(profile?.is_hcg),
    queryFn: () => q<Diagnosis[]>(supabase.from('diagnoses').select('*, orgs(id, name, industry, employee_count)').order('created_at', { ascending: false })),
  });
  const cost = useQuery({
    queryKey: ['admin-cost'],
    enabled: Boolean(profile?.is_hcg),
    queryFn: () => q<{ diagnosis_id: string; cost_usd: number }[]>(supabase.from('ai_ledger').select('diagnosis_id, cost_usd')),
  });
  if (loading) return <Spinner />;
  if (!profile?.is_hcg) return <Navigate to="/" replace />;
  const costOf = (id: string) => (cost.data ?? []).filter((c) => c.diagnosis_id === id).reduce((a, c) => a + Number(c.cost_usd), 0);
  const order = ['review', 'analyzing', 'collecting', 'setup', 'published', 'closed'];
  const rows = [...(list.data ?? [])].sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status));

  return (
    <AppShell>
      <PageHeader title="HCG 콘솔" sub="전체 진단 · 검수 대기 리포트 · AI 원가" />
      {list.isLoading ? <Spinner /> : list.error ? <ErrorBox error={list.error} /> : (
        <Card>
          <table className="w-full text-sm">
            <thead><tr className="text-xs text-slate-500 text-left border-b border-slate-100"><th className="px-5 py-3">고객사 · 진단</th><th>방식</th><th>상태</th><th>생성</th><th className="text-right">AI 원가</th><th className="px-5" /></tr></thead>
            <tbody>
              {rows.map((d) => (
                <tr key={d.id} className="border-b border-slate-50">
                  <td className="px-5 py-3"><div className="font-semibold">{d.orgs?.name}</div><div className="text-xs text-slate-500">{d.title} · <span className="mono">{d.code}</span></div></td>
                  <td className="text-xs">{d.kind === 'health' ? '헬스체크' : `딥진단 ${d.modules.join(',')}`}</td>
                  <td><Pill tone={d.status === 'review' ? 'violet' : d.status === 'published' ? 'emerald' : 'slate'}>{STATUS_LABEL[d.status]}</Pill></td>
                  <td className="text-xs text-slate-500">{fmtDate(d.created_at)}</td>
                  <td className="text-right num text-xs">${costOf(d.id).toFixed(2)}</td>
                  <td className="px-5 text-right"><button onClick={() => nav(`/room/${d.id}${d.status === 'review' ? '/report' : ''}`)} className="inline-flex items-center gap-1 text-xs rounded-lg bg-slate-900 text-white px-3 py-1.5"><Lock size={12} />입장</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </AppShell>
  );
}
