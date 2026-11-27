import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, BadgeCheck, FileText, Printer, RotateCw, ShieldCheck, Sparkles } from 'lucide-react';
import { supabase, q, fn } from '../../lib/supabase';
import { cx, fmtTime } from '../../lib/format';
import type { Domain, MaturityArea, MaturityScore, Module, Report, ReportIssue } from '../../lib/types';
import { useRoom, RoomTitle, Watermark, logAccess } from '../../components/secure/SecureRoom';
import { Button, Card, CardHead, Empty, ErrorBox, Pill, Spinner, useToast } from '../../components/ui';
import { MaturityBar, posTone } from '../../components/charts';
import { useAnalysis } from './RoomAnalysis';

const SRC: Record<string, string> = { survey: '설문', interview: '인터뷰', document: '제도 문서', data: 'HR 데이터' };
const CERT_TONE: Record<string, 'emerald' | 'indigo' | 'slate'> = { 확실: 'emerald', '가능성 높음': 'indigo', '통상 그러함': 'slate' };
const TRACK: Record<string, string> = { exec: '임원', leader: '조직장', staff: '구성원' };

export default function RoomReport() {
  const { diag, isHcg, refresh, viewer } = useRoom();
  const qc = useQueryClient();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<unknown>(null);
  const rep = useQuery({ queryKey: ['report', diag.id], queryFn: () => q<Report | null>(supabase.from('reports').select('*').eq('diagnosis_id', diag.id).maybeSingle()) });
  const an = useAnalysis(diag.id);
  const domains = useQuery({ queryKey: ['domains'], queryFn: () => q<Domain[]>(supabase.from('domains').select('*').order('sort')) });
  const mods = useQuery({ queryKey: ['modules'], queryFn: () => q<Module[]>(supabase.from('modules').select('*').order('sort')) });
  const areas = useQuery({ queryKey: ['mat-areas'], queryFn: () => q<MaturityArea[]>(supabase.from('maturity_areas').select('*').order('sort')) });
  const scores = useQuery({ queryKey: ['mat', diag.id], queryFn: () => q<MaturityScore[]>(supabase.from('maturity_scores').select('*').eq('diagnosis_id', diag.id)) });
  const domName = (id: string) => domains.data?.find((d) => d.id === id)?.name ?? id;

  const generate = async () => {
    setBusy('gen'); setErr(null);
    try { await fn('ai-report', { diagnosis_id: diag.id }); await qc.invalidateQueries({ queryKey: ['report', diag.id] }); refresh(); toast('리포트 초안을 만들었습니다'); }
    catch (e) { setErr(e); } finally { setBusy(null); }
  };
  const publish = async () => {
    setBusy('pub'); setErr(null);
    try {
      const { data: u } = await supabase.auth.getUser();
      const r1 = await supabase.from('reports').update({ status: 'published', published_at: new Date().toISOString(), published_by: u.user?.id }).eq('diagnosis_id', diag.id);
      if (r1.error) throw r1.error;
      await supabase.from('diagnoses').update({ status: 'published', survey_open: false }).eq('id', diag.id);
      await logAccess(diag.id, 'publish');
      await qc.invalidateQueries({ queryKey: ['report', diag.id] }); refresh(); toast('리포트를 발행했습니다');
    } catch (e) { setErr(e); } finally { setBusy(null); }
  };

  if (rep.isLoading) return <Spinner />;
  const r = rep.data;
  const s = r?.sections;

  if (!r) {
    return (
      <>
        <RoomTitle title="리포트" />
        <ErrorBox error={err} />
        <Card>
          {diag.status === 'review' && !isHcg ? (
            <Empty icon={<ShieldCheck size={18} />} title="HCG 컨설턴트가 검수하고 있습니다">초안이 만들어졌습니다. 검수가 끝나 발행되면 이곳에서 볼 수 있습니다.</Empty>
          ) : (
            <Empty icon={<FileText size={18} />} title="아직 리포트가 없습니다"
              action={<Button onClick={generate} loading={busy === 'gen'} disabled={!an.data}><Sparkles size={14} />리포트 초안 만들기</Button>}>
              {an.data ? '설문 분석 · 인터뷰 요약 · 제도 문서 점검을 종합해 이슈와 개선 방향을 정리합니다 (1~2분).' : '먼저 [분석]에서 설문 분석을 실행해 주세요.'}
            </Empty>
          )}
        </Card>
      </>
    );
  }

  const a = an.data?.result;
  const areaAvg = (areas.data ?? []).map((ar) => {
    const ls = (scores.data ?? []).filter((x) => x.area_id === ar.id).map((x) => Number(x.level));
    return { id: ar.id, name: ar.name, level: ls.length ? Math.round((ls.reduce((p, c) => p + c, 0) / ls.length) * 10) / 10 : null };
  });

  return (
    <div className="relative">
      <Watermark text={`${diag.orgs?.name ?? ''} · ${viewer} · CONFIDENTIAL`} />
      <div className="relative z-10">
        <RoomTitle title="진단 리포트" sub={`${r.status === 'published' ? `발행 ${fmtTime(r.published_at)}` : `초안 ${fmtTime(r.generated_at)} · 고객사에는 아직 보이지 않습니다`}`}
          right={<div className="no-print flex gap-2">
            {isHcg && <Button variant="secondary" onClick={generate} loading={busy === 'gen'}><RotateCw size={14} />다시 생성</Button>}
            {isHcg && r.status === 'draft' && <Button onClick={publish} loading={busy === 'pub'}><BadgeCheck size={14} />검수 완료 · 발행</Button>}
            <Button variant="secondary" onClick={() => window.print()}><Printer size={14} />인쇄·PDF</Button>
          </div>} />
        <ErrorBox error={err} />
        {r.status === 'draft' && <div className="mb-4 rounded-xl bg-violet-50 text-violet-900 text-sm px-4 py-3">HCG 검수용 초안입니다. 내용을 확인한 뒤 발행하면 고객사가 볼 수 있습니다.</div>}

        <div className="space-y-5">
          {/* 1. 경영진 요약 */}
          <Card className="p-6">
            <div className="text-xs tracking-[0.18em] text-indigo-600 font-semibold">EXECUTIVE SUMMARY</div>
            <h2 className="text-xl font-bold mt-2 leading-snug">{s?.headline}</h2>
            <div className="grid md:grid-cols-3 gap-3 mt-5">
              {(s?.summary ?? []).map((x, i) => (
                <div key={i} className="rounded-xl bg-slate-50 p-4"><div className="text-xs text-slate-400 num">0{i + 1}</div><div className="font-semibold mt-1">{x.title}</div><p className="text-sm text-slate-600 mt-1.5 leading-relaxed">{x.body}</p></div>
              ))}
            </div>
          </Card>

          {/* 2. HR Snapshot */}
          <Card>
            <CardHead title="HR Snapshot" right={<span>구성원 인식(긍정률) · 제도 성숙도(Lv 1~4)</span>} />
            <div className="p-5 grid lg:grid-cols-2 gap-6">
              <div>
                <div className="text-xs font-semibold text-slate-500 mb-2">구성원 인식 — 영역별 긍정률</div>
                <div className="grid grid-cols-2 gap-1.5">
                  {(a?.domains ?? []).map((d) => (
                    <div key={d.id} className={cx('rounded-lg px-3 py-2 text-sm flex justify-between', posTone(d.pos))}><span>{d.name}</span><span className="num font-semibold">{d.pos == null ? '-' : `${Math.round(d.pos)}%`}</span></div>
                  ))}
                </div>
              </div>
              <div>
                <div className="text-xs font-semibold text-slate-500 mb-2">제도 성숙도 — 문서 근거</div>
                <div className="space-y-2">{areaAvg.map((x) => <div key={x.id} className="grid grid-cols-[5rem_1fr] items-center gap-3 text-sm"><span>{x.name}</span><MaturityBar level={x.level} /></div>)}</div>
                {areaAvg.every((x) => x.level == null) && <p className="text-xs text-slate-400 mt-2">제도 문서를 올리면 채워집니다.</p>}
              </div>
            </div>
          </Card>

          {/* 3. Key Issues */}
          <Card>
            <CardHead title={`핵심 이슈 ${s?.key_issues?.length ?? 0}`} right={<span>선정 기준: 구성원 불만의 크기 × 몰입·재직·타 영역 파급</span>} />
            <div className="p-5 space-y-4">{(s?.key_issues ?? []).map((x, i) => <IssueCard key={i} n={i + 1} issue={x} domName={domName} />)}</div>
          </Card>

          {/* 4. 근본 원인 · Say-Do */}
          <div className="grid lg:grid-cols-2 gap-5">
            <Card>
              <CardHead title="근본 원인" />
              <div className="p-5">
                <p className="font-semibold leading-relaxed">{s?.root_cause?.core}</p>
                <ul className="mt-4 space-y-3">
                  {(s?.root_cause?.chains ?? []).map((c, i) => (
                    <li key={i} className="text-sm"><div className="font-semibold text-rose-700">{c.cause}</div><div className="flex flex-wrap gap-1.5 mt-1.5">{c.leads_to.map((t) => <span key={t} className="inline-flex items-center gap-1 text-xs bg-slate-100 rounded-full px-2 py-0.5"><ArrowRight size={10} />{t}</span>)}</div></li>
                  ))}
                </ul>
              </div>
            </Card>
            <Card>
              <CardHead title="말과 실제의 차이 (Say-Do)" />
              <div className="p-5 space-y-3">
                {(s?.say_do ?? []).length ? s!.say_do!.map((x, i) => (
                  <div key={i} className="text-sm rounded-lg border border-slate-200 p-3">
                    <div className="font-semibold">{x.topic}</div>
                    <div className="grid grid-cols-2 gap-3 mt-2 text-xs"><div><div className="text-slate-400">구성원 인식</div>{x.say}</div><div><div className="text-slate-400">문서·데이터</div>{x.do}</div></div>
                    <div className="text-xs text-rose-700 mt-2">{x.gap}</div>
                  </div>
                )) : <p className="text-sm text-slate-400">제도 문서가 있으면 인식과 실제를 비교합니다.</p>}
              </div>
            </Card>
          </div>

          {/* 5. 개선 방향 · 과제 */}
          <Card>
            <CardHead title="개선 방향과 과제" right={<span>● Quick Win(3개월 내)</span>} />
            <div className="p-5 grid lg:grid-cols-[1fr_17rem] gap-6">
              <div className="space-y-5">
                {(s?.directions ?? []).map((d, i) => (
                  <div key={i}>
                    <div className="font-semibold">{i + 1}. {d.title}</div>
                    <p className="text-sm text-slate-500 mt-0.5">{d.why}</p>
                    <ul className="mt-2 space-y-1.5">
                      {d.tasks.map((t, j) => (
                        <li key={j} className="text-sm flex gap-2"><span className={cx('mt-1.5 w-2 h-2 rounded-full shrink-0', t.quick_win ? 'bg-emerald-500' : 'bg-slate-300')} /><span><b>{t.title}</b> — <span className="text-slate-600">{t.desc}</span></span></li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
              <PriorityMatrix tasks={(s?.directions ?? []).flatMap((d) => d.tasks)} />
            </div>
          </Card>

          {/* 6. 처방 */}
          <div className="grid lg:grid-cols-2 gap-5">
            <Card>
              <CardHead title="추천 다음 단계" />
              <ul className="p-5 space-y-3">
                {(s?.recommended_modules ?? []).map((m) => (
                  <li key={m.module_id} className="text-sm"><Pill tone="indigo">{mods.data?.find((x) => x.id === m.module_id)?.name ?? m.module_id} 딥진단</Pill><p className="text-slate-600 mt-1.5">{m.reason}</p></li>
                ))}
                <li className="text-xs text-slate-500 pt-2 border-t border-slate-100">진단비는 HCG 설계 컨설팅 계약 시 전액 차감됩니다.</li>
              </ul>
            </Card>
            <Card>
              <CardHead title="경영진이 결정해야 할 설계 질문" />
              <ol className="p-5 space-y-2 text-sm list-decimal list-inside">{(s?.design_questions ?? []).map((x, i) => <li key={i}>{x}</li>)}</ol>
            </Card>
          </div>

          {/* 7. 전체 이슈 · 인터뷰 · 주관식 */}
          <Card>
            <CardHead title={`이슈 전체 ${s?.issues?.length ?? 0}`} />
            <div className="p-5 overflow-x-auto">
              <table className="text-sm w-full">
                <thead><tr className="text-xs text-slate-500 text-left"><th className="pb-2">영역</th><th className="pb-2">이슈</th><th className="pb-2">근거 확실성</th><th className="pb-2 text-right">심각도</th><th className="pb-2 text-right">파급</th></tr></thead>
                <tbody>
                  {(s?.issues ?? []).map((x, i) => (
                    <tr key={i} className="border-t border-slate-100 align-top">
                      <td className="py-2 pr-3 text-xs text-slate-500 whitespace-nowrap">{domName(x.domain_id)}</td>
                      <td className="py-2 pr-3"><div className="font-semibold">{x.title}</div><div className="text-xs text-slate-500 mt-0.5">{x.finding}</div></td>
                      <td className="py-2 pr-3"><Pill tone={CERT_TONE[x.certainty] ?? 'slate'}>{x.certainty}</Pill></td>
                      <td className="py-2 text-right num">{x.severity}</td>
                      <td className="py-2 text-right num">{x.impact}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <div className="grid lg:grid-cols-2 gap-5">
            <Card>
              <CardHead title="인터뷰 요지" />
              <div className="p-5 space-y-4 text-sm">
                {(s?.interview_digest ?? []).map((g, i) => (
                  <div key={i}><div className="text-xs font-semibold text-slate-500">{TRACK[g.track] ?? g.track}</div><ul className="mt-1 space-y-1 list-disc list-inside text-slate-700">{g.points.map((p, j) => <li key={j}>{p}</li>)}</ul></div>
                ))}
                {!(s?.interview_digest ?? []).length && <p className="text-slate-400">완료된 인터뷰가 없습니다.</p>}
              </div>
            </Card>
            <Card>
              <CardHead title="주관식 주제" />
              <div className="p-5 space-y-4 text-sm">
                {(s?.text_digest ?? []).map((t, i) => (
                  <ul key={i} className="space-y-2">{t.themes.map((th, j) => (
                    <li key={j}><div className="flex items-center gap-2"><b>{th.theme}</b><Pill>{th.weight}</Pill></div>{th.quote && <div className="text-xs text-slate-500 mt-0.5">“{th.quote}”</div>}</li>
                  ))}</ul>
                ))}
              </div>
            </Card>
          </div>

          {!!s?.caveats?.length && <div className="text-xs text-slate-500 rounded-xl border border-slate-200 bg-white p-4">해석 시 유의: {s.caveats.join(' · ')}</div>}
        </div>
      </div>
    </div>
  );
}

function IssueCard({ n, issue, domName }: { n: number; issue: ReportIssue; domName: (id: string) => string }) {
  return (
    <div className="rounded-xl border border-slate-200 p-4">
      <div className="flex items-start gap-3">
        <span className="w-7 h-7 rounded-lg bg-rose-50 text-rose-700 font-bold text-sm flex items-center justify-center shrink-0 num">{n}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap"><span className="font-semibold">{issue.title}</span><Pill>{domName(issue.domain_id)}</Pill><Pill tone={CERT_TONE[issue.certainty] ?? 'slate'}>근거 {issue.certainty}</Pill></div>
          <p className="text-sm text-slate-600 mt-1.5 leading-relaxed">{issue.finding}</p>
          {!!issue.evidence?.length && (
            <ul className="mt-2 grid md:grid-cols-2 gap-1.5">
              {issue.evidence.map((e, i) => <li key={i} className="text-xs rounded-lg bg-slate-50 px-2.5 py-1.5"><b className="text-slate-500 mr-1">{SRC[e.source] ?? e.source}</b>{e.text}</li>)}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function PriorityMatrix({ tasks }: { tasks: { title: string; importance: number; urgency: number; quick_win: boolean }[] }) {
  return (
    <div>
      <div className="text-xs font-semibold text-slate-500 mb-2">우선순위 (중요도 × 시급성)</div>
      <div className="relative aspect-square rounded-xl border border-slate-200 bg-white">
        <div className="absolute inset-0 grid grid-cols-2 grid-rows-2">
          <div className="border-r border-b border-dashed border-slate-200 p-1.5 text-[10px] text-slate-400">중요 · 덜 급함</div>
          <div className="border-b border-dashed border-slate-200 p-1.5 text-[10px] text-rose-500 text-right font-semibold bg-rose-50/40">우선 과제</div>
          <div className="border-r border-dashed border-slate-200 p-1.5 text-[10px] text-slate-400 flex items-end">후순위</div>
          <div className="p-1.5 text-[10px] text-slate-400 text-right flex items-end justify-end">급하지만 덜 중요</div>
        </div>
        {tasks.map((t, i) => (
          <span key={i} title={t.title} className={cx('absolute w-3 h-3 -ml-1.5 -mt-1.5 rounded-full ring-2 ring-white', t.quick_win ? 'bg-emerald-500' : 'bg-indigo-500')}
            style={{ left: `${((t.urgency - 0.5) / 5) * 100}%`, top: `${100 - ((t.importance - 0.5) / 5) * 100}%` }} />
        ))}
      </div>
      <div className="flex justify-between text-[10px] text-slate-400 mt-1"><span>시급성 낮음</span><span>높음 →</span></div>
    </div>
  );
}
