import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Check, History } from 'lucide-react';
import { supabase, q } from '../../lib/supabase';
import { cx, fmtTime } from '../../lib/format';
import { useRoom, RoomTitle } from '../../components/secure/SecureRoom';
import { Card, CardHead } from '../../components/ui';
import { useSession } from '../../state/session';

const ACTION: Record<string, string> = { create: '공간 생성', enter: '입장', exit: '퇴장', lock: '화면 잠금', unlock: '잠금 해제', publish: '리포트 발행' };

export default function RoomOverview() {
  const { diag } = useRoom();
  const { profile } = useSession();
  const stats = useQuery({ queryKey: ['rstats', diag.id], queryFn: () => q<{ total: number; valid: number }>(supabase.rpc('response_stats', { p_diag: diag.id })) });
  const inv = useQuery({ queryKey: ['inv-count', diag.id], queryFn: () => q<{ status: string }[]>(supabase.from('interview_invites').select('status').eq('diagnosis_id', diag.id)) });
  const docs = useQuery({ queryKey: ['doc-count', diag.id], queryFn: () => q<{ status: string }[]>(supabase.from('documents').select('status').eq('diagnosis_id', diag.id)) });
  const an = useQuery({ queryKey: ['an-exists', diag.id], queryFn: () => q<{ computed_at: string } | null>(supabase.from('analyses').select('computed_at').eq('diagnosis_id', diag.id).maybeSingle()) });
  const log = useQuery({ queryKey: ['log', diag.id], queryFn: () => q<{ id: number; user_id: string; action: string; at: string }[]>(supabase.from('access_log').select('id, user_id, action, at').eq('diagnosis_id', diag.id).order('at', { ascending: false }).limit(12)) });

  const units = diag.settings.segments?.unit ?? [];
  const steps = [
    { key: 'design', label: '진단 설계', done: units.length > 0, desc: units.length ? `조직 ${units.length}개 등록` : '응답자 조직 구분을 등록하세요', to: 'design' },
    { key: 'survey', label: '직원 설문', done: (stats.data?.total ?? 0) >= 5, desc: diag.survey_open ? `응답 ${stats.data?.total ?? 0}건 · 받는 중` : `응답 ${stats.data?.total ?? 0}건 · 링크 닫힘`, to: 'survey' },
    { key: 'interviews', label: 'AI 인터뷰', done: (inv.data ?? []).some((i) => i.status === 'done'), desc: `완료 ${(inv.data ?? []).filter((i) => i.status === 'done').length} / 초대 ${(inv.data ?? []).length}`, to: 'interviews' },
    { key: 'documents', label: '제도 문서', done: (docs.data ?? []).some((d) => d.status === 'done'), desc: `분석 ${(docs.data ?? []).filter((d) => d.status === 'done').length} / 업로드 ${(docs.data ?? []).length}`, to: 'documents' },
    { key: 'analysis', label: '분석', done: Boolean(an.data), desc: an.data ? `최근 분석 ${fmtTime(an.data.computed_at)}` : '설문 5건 이상이면 실행할 수 있습니다', to: 'analysis' },
    { key: 'report', label: '리포트', done: diag.status === 'published', desc: diag.status === 'published' ? '발행 완료' : diag.status === 'review' ? 'HCG 검수 중' : '분석 후 초안을 만듭니다', to: 'report' },
  ];
  const next = steps.find((s) => !s.done);

  return (
    <>
      <RoomTitle title={diag.kind === 'health' ? 'HR 헬스체크' : '모듈 딥진단'} sub={`${diag.orgs?.name} · ${diag.title}`} />
      {next && (
        <Link to={next.to} className="flex items-center justify-between gap-3 rounded-2xl bg-indigo-600 text-white px-5 py-4 mb-6 hover:bg-indigo-700">
          <div><div className="text-xs text-indigo-200">다음 할 일</div><div className="font-semibold">{next.label} — {next.desc}</div></div>
          <ArrowRight size={18} />
        </Link>
      )}
      <div className="grid lg:grid-cols-[1fr_20rem] gap-5">
        <Card>
          <CardHead title="진행 현황" />
          <ol className="p-5 space-y-1">
            {steps.map((s, i) => (
              <li key={s.key}>
                <Link to={s.to} className="flex items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-slate-50">
                  <span className={cx('w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0', s.done ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500')}>{s.done ? <Check size={14} strokeWidth={3} /> : i + 1}</span>
                  <span className="flex-1 min-w-0"><span className="font-semibold text-sm">{s.label}</span><span className="block text-xs text-slate-500">{s.desc}</span></span>
                  <ArrowRight size={14} className="text-slate-300" />
                </Link>
              </li>
            ))}
          </ol>
        </Card>
        <Card>
          <CardHead title="접근 기록" icon={<History size={16} className="text-slate-400" />} />
          <ul className="p-4 space-y-2 text-xs">
            {(log.data ?? []).map((l) => (
              <li key={l.id} className="flex justify-between gap-2">
                <span className="text-slate-700">{l.user_id === profile?.id ? '나' : '다른 사용자'} · {ACTION[l.action] ?? l.action}</span>
                <span className="mono text-slate-400">{fmtTime(l.at)}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
