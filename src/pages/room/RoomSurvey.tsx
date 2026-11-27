import { useQuery } from '@tanstack/react-query';
import { Copy, ExternalLink, RefreshCw } from 'lucide-react';
import { supabase, q } from '../../lib/supabase';
import { fmtTime } from '../../lib/format';
import { useRoom, RoomTitle } from '../../components/secure/SecureRoom';
import { Bar, Button, Card, CardHead, useToast } from '../../components/ui';

export default function RoomSurvey() {
  const { diag, refresh } = useRoom();
  const toast = useToast();
  const stats = useQuery({
    queryKey: ['rstats', diag.id],
    queryFn: () => q<{ total: number; valid: number; by_unit: Record<string, number>; last_at: string | null }>(supabase.rpc('response_stats', { p_diag: diag.id })),
    refetchInterval: 30000,
  });
  const link = `${window.location.origin}/s/${diag.survey_token}`;
  const units = diag.settings.segments?.unit ?? [];
  const head = units.reduce((a, u) => a + (u.headcount ?? 0), 0);
  const total = stats.data?.total ?? 0;

  const setOpen = async (open: boolean) => {
    const patch: Record<string, unknown> = { survey_open: open };
    if (open && diag.status === 'setup') patch.status = 'collecting';
    await supabase.from('diagnoses').update(patch).eq('id', diag.id);
    refresh(); toast(open ? '응답을 받기 시작합니다' : '설문을 닫았습니다');
  };

  const notice = `[${diag.orgs?.name} 조직·인사 진단 설문 안내]\n\n회사의 조직·인사 제도를 함께 점검하기 위해 외부 전문기관(HCG)과 진단을 진행합니다.\n설문은 익명으로 진행되며, 개별 응답은 HCG만 보고 회사에는 5명 이상 묶은 통계만 전달됩니다.\n\n· 소요 시간: 약 15분\n· 참여 링크: ${link}\n\n솔직한 의견이 더 나은 회사를 만듭니다. 감사합니다.`;

  return (
    <>
      <RoomTitle title="직원 설문" sub="링크 하나로 전 직원이 익명 응답합니다. 이름·이메일·IP는 저장하지 않습니다."
        right={diag.survey_open ? <Button variant="secondary" onClick={() => setOpen(false)}>설문 닫기</Button> : <Button onClick={() => setOpen(true)} disabled={!units.length}>응답 받기 시작</Button>} />
      {!units.length && <div className="mb-5 rounded-xl bg-amber-50 text-amber-900 text-sm px-4 py-3">먼저 [진단 설계]에서 조직 구분을 등록해 주세요.</div>}
      <div className="grid lg:grid-cols-2 gap-5">
        <Card>
          <CardHead title="설문 링크" right={<span className={diag.survey_open ? 'text-emerald-600 font-semibold' : ''}>{diag.survey_open ? '● 받는 중' : '닫힘'}</span>} />
          <div className="p-5 space-y-3">
            <div className="flex gap-2">
              <input readOnly value={link} className="flex-1 text-xs font-mono border border-slate-200 rounded-lg px-3 py-2 bg-slate-50" />
              <Button variant="secondary" onClick={() => { void navigator.clipboard.writeText(link); toast('링크를 복사했습니다'); }}><Copy size={14} /></Button>
              <a href={link} target="_blank" rel="noreferrer" className="inline-flex items-center px-3 rounded-lg border border-slate-200 hover:bg-slate-50"><ExternalLink size={14} /></a>
            </div>
            <div className="text-xs text-slate-500">사내 메신저·메일로 아래 안내문과 함께 보내세요.</div>
            <textarea readOnly value={notice} className="w-full h-48 text-xs border border-slate-200 rounded-lg p-3 bg-slate-50" />
            <Button variant="soft" onClick={() => { void navigator.clipboard.writeText(notice); toast('안내문을 복사했습니다'); }}><Copy size={14} />안내문 복사</Button>
          </div>
        </Card>
        <Card>
          <CardHead title="응답 현황" right={<button onClick={() => stats.refetch()} className="inline-flex items-center gap-1"><RefreshCw size={12} />새로고침</button>} />
          <div className="p-5">
            <div className="flex items-end gap-3">
              <div className="text-4xl font-bold num">{total}</div>
              <div className="text-sm text-slate-500 pb-1">건{head ? ` / ${head}명 (${Math.round((total / head) * 100)}%)` : ''}</div>
            </div>
            {stats.data?.last_at && <div className="text-xs text-slate-400 mt-1">마지막 응답 {fmtTime(stats.data.last_at)}</div>}
            <div className="mt-5 space-y-3">
              {units.map((u) => {
                const n = stats.data?.by_unit?.[u.name] ?? 0;
                const rate = u.headcount ? Math.round((n / u.headcount) * 100) : null;
                return (
                  <div key={u.name}>
                    <div className="flex justify-between text-sm mb-1"><span>{u.name}</span><span className="num text-slate-500">{n}{u.headcount ? ` / ${u.headcount} · ${rate}%` : '건'}</span></div>
                    <Bar value={rate ?? Math.min(100, n * 5)} tone={rate != null && rate < 50 ? 'amber' : 'indigo'} />
                  </div>
                );
              })}
            </div>
            <p className="text-xs text-slate-500 mt-5">통상 응답률 60% 이상이면 조직별 비교가 가능합니다. 응답이 5건 미만인 조직은 결과에서 숨겨집니다.</p>
          </div>
        </Card>
      </div>
    </>
  );
}
