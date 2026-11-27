import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, ClipboardCheck, Lock, Plus, Stethoscope } from 'lucide-react';
import { supabase, q } from '../lib/supabase';
import { fmtDate } from '../lib/format';
import { STATUS_LABEL, type Diagnosis } from '../lib/types';
import { AppShell } from '../components/AppShell';
import { Button, Card, Empty, ErrorBox, PageHeader, Pill, Spinner } from '../components/ui';

export default function Home() {
  const nav = useNavigate();
  const list = useQuery({
    queryKey: ['diagnoses'],
    queryFn: () => q<Diagnosis[]>(supabase.from('diagnoses').select('*, orgs(id, name, industry, employee_count)').order('created_at', { ascending: false })),
  });
  return (
    <AppShell>
      <PageHeader title="진단" sub="진단은 각각 분리된 보안 공간에서 진행됩니다." right={<Button onClick={() => nav('/new')}><Plus size={16} />새 진단 시작</Button>} />
      <div className="grid md:grid-cols-2 gap-4 mb-8">
        <Link to="/new?kind=health" className="group rounded-2xl bg-white border border-slate-200 p-5 hover:border-indigo-300">
          <div className="flex items-center gap-2 font-semibold"><Stethoscope size={18} className="text-indigo-600" />HR 헬스체크</div>
          <p className="text-sm text-slate-500 mt-1.5">인사제도 전반을 넓게 점검합니다. 어디가 아픈지 모를 때. 결과에서 깊게 볼 모듈을 추천합니다.</p>
          <span className="text-sm text-indigo-700 font-semibold mt-3 inline-flex items-center gap-1">시작하기 <ArrowRight size={14} /></span>
        </Link>
        <Link to="/new?kind=module" className="group rounded-2xl bg-white border border-slate-200 p-5 hover:border-indigo-300">
          <div className="flex items-center gap-2 font-semibold"><ClipboardCheck size={18} className="text-indigo-600" />모듈 딥진단</div>
          <p className="text-sm text-slate-500 mt-1.5">평가·보상·직급처럼 고민이 분명할 때, 해당 영역만 골라 깊게 진단합니다.</p>
          <span className="text-sm text-indigo-700 font-semibold mt-3 inline-flex items-center gap-1">모듈 고르기 <ArrowRight size={14} /></span>
        </Link>
      </div>

      <h2 className="font-semibold mb-3">내 진단</h2>
      {list.isLoading ? <Spinner /> : list.error ? <ErrorBox error={list.error} /> : !list.data?.length ? (
        <Card><Empty icon={<Lock size={18} />} title="아직 진단이 없습니다">새 진단을 시작하면 그 진단만을 위한 보안 공간이 만들어집니다.</Empty></Card>
      ) : (
        <div className="grid md:grid-cols-2 gap-3">
          {list.data.map((d) => (
            <Card key={d.id} className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs text-slate-400 mono">SESSION {d.code}</div>
                  <div className="font-semibold mt-0.5 truncate">{d.orgs?.name} · {d.title}</div>
                  <div className="text-xs text-slate-500 mt-1">{d.kind === 'health' ? 'HR 헬스체크' : `모듈 딥진단 (${d.modules.join(', ')})`} · {fmtDate(d.created_at)}</div>
                </div>
                <Pill tone={d.status === 'published' ? 'emerald' : d.status === 'review' ? 'violet' : 'slate'}>{STATUS_LABEL[d.status]}</Pill>
              </div>
              <button onClick={() => nav(`/room/${d.id}`)} className="mt-4 w-full inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 text-white text-sm font-semibold py-2.5 hover:bg-slate-800">
                <Lock size={14} />보안 공간 입장
              </button>
            </Card>
          ))}
        </div>
      )}
    </AppShell>
  );
}
