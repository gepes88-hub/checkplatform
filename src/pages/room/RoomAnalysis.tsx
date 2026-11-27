import { Fragment, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BarChart3, Play } from 'lucide-react';
import { supabase, q, fn } from '../../lib/supabase';
import { cx, fmtTime } from '../../lib/format';
import { DIM_LABEL, type Analysis } from '../../lib/types';
import { useRoom, RoomTitle, Watermark } from '../../components/secure/SecureRoom';
import { Button, Card, CardHead, Empty, ErrorBox, Spinner, Tabs } from '../../components/ui';
import { HBars, IpaChart, TypeQuadrant, meanTone, posTone } from '../../components/charts';

export function useAnalysis(diagnosisId: string) {
  return useQuery({
    queryKey: ['analysis', diagnosisId],
    queryFn: () => q<{ result: Analysis; computed_at: string } | null>(supabase.from('analyses').select('result, computed_at').eq('diagnosis_id', diagnosisId).maybeSingle()),
  });
}

export default function RoomAnalysis() {
  const { diag, refresh, viewer } = useRoom();
  const qc = useQueryClient();
  const an = useAnalysis(diag.id);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const [dim, setDim] = useState<string>('unit');

  const run = async () => {
    setBusy(true); setErr(null);
    try { await fn('analyze', { diagnosis_id: diag.id }); await qc.invalidateQueries({ queryKey: ['analysis', diag.id] }); refresh(); }
    catch (e) { setErr(e); } finally { setBusy(false); }
  };

  const a = an.data?.result;
  return (
    <div className="relative">
      <Watermark text={`${diag.orgs?.name ?? ''} · ${viewer} · CONFIDENTIAL`} />
      <div className="relative z-10">
        <RoomTitle title="분석" sub={a ? `최근 분석 ${fmtTime(an.data!.computed_at)} · 숫자는 모두 응답 데이터에서 계산합니다 (AI가 만들지 않습니다)` : '설문 응답이 5건 이상이면 분석할 수 있습니다.'}
          right={<Button onClick={run} loading={busy}><Play size={14} />{a ? '다시 분석' : '분석 실행'}</Button>} />
        <ErrorBox error={err} />
        {an.isLoading ? <Spinner /> : !a ? <Card><Empty icon={<BarChart3 size={18} />} title="아직 분석 결과가 없습니다" /></Card> : (
          <div className="space-y-5 mt-2">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {[
                ['유효 응답', `${a.counts.valid}`, `전체 ${a.counts.total} · 무성의 제외 ${a.counts.excluded}`],
                ['응답률', a.counts.rate != null ? `${a.counts.rate}%` : '-', a.counts.headcount ? `대상 ${a.counts.headcount}명` : '인원 미등록'],
                ['지원 환경 지수', a.index.driver?.toFixed(2) ?? '-', '투입·과정 영역 평균 (5점)'],
                ['몰입·만족 지수', a.index.outcome?.toFixed(2) ?? '-', '직무만족·조직몰입·재직의도'],
                ['Effective 비율', `${Math.round(a.types.pct.effective)}%`, '지원·몰입 모두 3점 이상'],
              ].map(([k, v, s]) => (
                <Card key={k} className="p-4"><div className="text-xs text-slate-500">{k}</div><div className="text-2xl font-bold num mt-1">{v}</div><div className="text-[11px] text-slate-400 mt-0.5">{s}</div></Card>
              ))}
            </div>

            <div className="grid lg:grid-cols-2 gap-5">
              <Card>
                <CardHead title="영역별 긍정 응답률" right={<span>4·5점 비율</span>} />
                <div className="p-5"><HBars rows={a.domains.filter((d) => d.module === 'core' || diag.modules.includes(d.module)).map((d) => ({ label: d.name, value: d.pos }))} avgLine={avgOf(a.domains.map((d) => d.pos))} /></div>
              </Card>
              <Card>
                <CardHead title="직원 유형" />
                <div className="p-5"><TypeQuadrant pct={a.types.pct} n={a.types.n} /></div>
              </Card>
            </div>

            <Card>
              <CardHead title="개선 우선순위 (IPA)" right={<span>영향도 = 몰입·만족·재직의도와의 상관</span>} />
              <div className="p-5 grid lg:grid-cols-[1fr_16rem] gap-5">
                <IpaChart points={a.ipa} />
                <ul className="text-sm space-y-2">
                  {['중점 개선', '장기 개선', '강점 유지', '현상 유지'].map((qd) => {
                    const xs = a.ipa.filter((p) => p.quadrant === qd);
                    return xs.length ? <li key={qd}><div className={cx('text-xs font-semibold', qd === '중점 개선' ? 'text-rose-600' : qd === '강점 유지' ? 'text-indigo-600' : qd === '장기 개선' ? 'text-amber-600' : 'text-slate-500')}>{qd}</div><div>{xs.map((x) => x.name).join(', ')}</div></li> : null;
                  })}
                </ul>
              </div>
            </Card>

            {(a.hr_sub.length > 0 || a.culture_type.length > 0) && (
              <div className="grid lg:grid-cols-2 gap-5">
                {a.hr_sub.length > 0 && <Card><CardHead title="인사제도 하위 영역" /><div className="p-5"><HBars rows={a.hr_sub.map((s) => ({ label: s.sub, value: s.pos }))} /></div></Card>}
                {a.culture_type.length > 0 && <Card><CardHead title="조직문화 — 현재 모습" right={<span>평균 (5점)</span>} /><div className="p-5"><HBars rows={a.culture_type.map((c) => ({ label: c.type, value: c.mean, tone: 'bg-violet-500' }))} max={5} unit="" /></div></Card>}
              </div>
            )}

            <Card>
              <CardHead title="그룹별 비교 (평균 · 5명 미만 숨김)" />
              <div className="px-5 pt-3"><Tabs value={dim} onChange={setDim} items={Object.keys(a.heat).map((k) => ({ id: k, label: DIM_LABEL[k] ?? k }))} /></div>
              <div className="p-5 overflow-x-auto">
                {a.heat[dim] ? (
                  <table className="text-xs w-full border-separate border-spacing-0.5">
                    <thead><tr><th className="text-left font-semibold text-slate-500 px-2 py-1">영역</th>{a.heat[dim].map((g) => <th key={g.value} className="font-semibold text-slate-600 px-2 py-1 whitespace-nowrap">{g.value}<div className="font-normal text-slate-400">n={g.n}</div></th>)}</tr></thead>
                    <tbody>
                      {a.domains.map((d) => (
                        <tr key={d.id}><td className="px-2 py-1 whitespace-nowrap text-slate-700">{d.name}</td>
                          {a.heat[dim].map((g) => <td key={g.value} className={cx('text-center px-2 py-1.5 rounded num', g.hidden ? 'bg-slate-50 text-slate-300' : meanTone(g.domains[d.id]))}>{g.hidden ? '·' : g.domains[d.id]?.toFixed(2) ?? '-'}</td>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : <div className="text-sm text-slate-400">이 구분으로 응답한 사람이 없습니다.</div>}
              </div>
            </Card>

            <div className="grid lg:grid-cols-2 gap-5">
              {([['긍정 응답 상위 5', a.top5], ['긍정 응답 하위 5', a.bottom5]] as const).map(([t, xs]) => (
                <Card key={t}><CardHead title={t} />
                  <ul className="p-4 space-y-2">{xs.map((x) => <li key={x.id} className="flex gap-3 text-sm"><span className={cx('rounded px-1.5 py-0.5 text-xs num font-semibold h-fit', posTone(x.pos))}>{Math.round(x.pos ?? 0)}%</span><span>{x.text}</span></li>)}</ul>
                </Card>
              ))}
            </div>

            {a.choices.length > 0 && (
              <div className="grid lg:grid-cols-2 gap-5">
                {a.choices.map((c) => (
                  <Card key={c.id}><CardHead title={c.text} right={<span>n={c.n}</span>} />
                    <div className="p-5"><HBars rows={c.ranks.slice(0, 8).map((r) => ({ label: r.label, value: r.pct, tone: 'bg-slate-500' }))} /></div>
                  </Card>
                ))}
              </div>
            )}

            <Card>
              <CardHead title="문항별 결과" right={<span>긍정 / 부정 / 평균</span>} />
              <div className="p-5 overflow-x-auto">
                <table className="text-sm w-full">
                  <tbody>
                    {a.domains.map((d) => (
                      <Fragment key={d.id}>
                        <tr><td colSpan={4} className="pt-4 pb-1 text-xs font-semibold text-slate-500">{d.name}</td></tr>
                        {a.items.filter((i) => i.domain_id === d.id).map((i) => (
                          <tr key={i.id} className="border-t border-slate-100">
                            <td className="py-1.5 pr-3">{i.text}</td>
                            <td className="text-right"><span className={cx('rounded px-1.5 py-0.5 text-xs num font-semibold', posTone(i.pos))}>{Math.round(i.pos ?? 0)}%</span></td>
                            <td className="text-right text-xs text-slate-500 num pl-2">{Math.round(i.neg ?? 0)}%</td>
                            <td className="text-right text-xs num pl-2">{i.mean?.toFixed(2)}</td>
                          </tr>
                        ))}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
                {a.texts.length > 0 && <p className="text-xs text-slate-400 mt-4">주관식 {a.texts.map((t) => `${t.count}건`).join(' · ')} — 원문은 개인 식별 위험이 있어 HCG만 보고, 리포트에 주제별로 요약됩니다.</p>}
              </div>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}

function avgOf(xs: (number | null)[]) {
  const v = xs.filter((x): x is number => x != null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : undefined;
}
