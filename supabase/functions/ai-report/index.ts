// 진단 리포트 초안 생성 (로그인 사용자 · Verify JWT 끔, 함수 안에서 사용자 확인)
//   설문 분석(숫자) + 인터뷰 요약 + 문서 점검 + Maturity + 이슈 라이브러리 → 이슈·근인·방향·과제
//   결과는 '초안'으로 저장되고, HCG 컨설턴트가 검수·발행해야 고객사가 볼 수 있다.
import { serve, readJson, HttpError } from '../_shared/http.ts';
import { admin, getCaller, assertDiag, ledger } from '../_shared/supabase.ts';
import { callClaude, parseJson, MODEL_SMART } from '../_shared/anthropic.ts';
import { reportSystem } from '../_shared/prompts.ts';
import { DIM_LABEL } from '../_shared/stats.ts';

serve(async (req) => {
  const { diagnosis_id } = await readJson<{ diagnosis_id: string }>(req);
  const caller = await getCaller(req);
  await assertDiag(caller, diagnosis_id);
  const { data: prev } = await admin.from('reports').select('status').eq('diagnosis_id', diagnosis_id).maybeSingle();
  if (prev?.status === 'published' && !caller.isHcg) throw new HttpError(403, 'forbidden', '발행된 리포트는 HCG 컨설턴트만 다시 만들 수 있습니다.');

  const { data: d } = await admin.from('diagnoses').select('id, title, kind, modules, status, orgs(name, industry, employee_count)').eq('id', diagnosis_id).single();
  const { data: an } = await admin.from('analyses').select('result').eq('diagnosis_id', diagnosis_id).maybeSingle();
  if (!an) throw new HttpError(422, 'NO_ANALYSIS', '먼저 설문 분석을 실행해 주세요.');
  // deno-lint-ignore no-explicit-any
  const a = an.result as any;

  const { data: priv } = await admin.from('analyses_private').select('texts').eq('diagnosis_id', diagnosis_id).maybeSingle();
  const texts = (priv?.texts ?? []) as { id: string; text: string; answers: string[] }[];
  const { data: invites } = await admin.from('interview_invites').select('track, label, summary').eq('diagnosis_id', diagnosis_id).eq('status', 'done');
  const { data: docs } = await admin.from('documents').select('name, extracted').eq('diagnosis_id', diagnosis_id).eq('status', 'done');
  const { data: mat } = await admin.from('maturity_scores').select('area_id, element, level, evidence').eq('diagnosis_id', diagnosis_id);
  const mods = ['core', ...((d?.modules as string[]) ?? [])];
  const { data: lib } = await admin.from('issue_library').select('id, domain_id, title, signals, root_causes, prescriptions').in('module', mods);

  // deno-lint-ignore no-explicit-any
  const org = (d as any)?.orgs ?? {};
  const heatText = Object.entries(a.heat ?? {}).map(([dim, groups]) =>
    // deno-lint-ignore no-explicit-any
    `${DIM_LABEL[dim] ?? dim}: ` + (groups as any[]).filter((g) => !g.hidden).map((g) => `${g.value}(n=${g.n}, 결과지수 ${g.outcome ?? '-'}; ` +
      Object.entries(g.domains).filter(([, v]) => v != null).map(([k, v]) => `${k} ${v}`).join(', ') + ')').join(' / ')).join('\n');

  const input = [
    `# 고객사: ${org.name ?? ''} (${org.industry ?? '업종 미기재'}, 직원 약 ${org.employee_count ?? '-'}명)`,
    `# 진단: ${d?.title} / 유형: ${d?.kind === 'health' ? 'HR 헬스체크' : `모듈 딥진단(${(d?.modules ?? []).join(', ')})`}`,
    `# 응답: 전체 ${a.counts.total}건, 유효 ${a.counts.valid}건, 무성의 제외 ${a.counts.excluded}건${a.counts.rate != null ? `, 응답률 ${a.counts.rate}%` : ''}`,
    `# 지수(5점): 지원환경(Driver) ${a.index.driver}, 결과(몰입·만족·재직) ${a.index.outcome}`,
    `# 직원 유형(%): Effective ${a.types.pct.effective}, Frustrated(몰입 높으나 지원 부족) ${a.types.pct.frustrated}, Detached(지원 있으나 몰입 낮음) ${a.types.pct.detached}, Ineffective ${a.types.pct.ineffective}`,
    `# 영역별 (평균 / 긍정률%)\n` + a.domains.map((x: { id: string; name: string; mean: number; pos: number }) => `- ${x.id} ${x.name}: ${x.mean} / ${x.pos}%`).join('\n'),
    `# 인사제도 하위\n` + (a.hr_sub ?? []).map((x: { sub: string; mean: number; pos: number }) => `- ${x.sub}: ${x.mean} / ${x.pos}%`).join('\n'),
    `# 조직문화 유형(현재 모습 평균)\n` + (a.culture_type ?? []).map((x: { type: string; mean: number }) => `- ${x.type}: ${x.mean}`).join('\n'),
    `# IPA (중요도=결과와의 상관, 수행=평균)\n` + (a.ipa ?? []).map((x: { id: string; name: string; importance: number; performance: number; quadrant: string }) => `- ${x.id} ${x.name}: 중요도 ${x.importance}, 수행 ${x.performance} → ${x.quadrant}`).join('\n'),
    `# Top 5 문항(긍정률)\n` + a.top5.map((x: { text: string; pos: number }) => `- ${x.pos}% ${x.text}`).join('\n'),
    `# Bottom 5 문항(긍정률)\n` + a.bottom5.map((x: { text: string; pos: number }) => `- ${x.pos}% ${x.text}`).join('\n'),
    `# 문항별 전체(id 영역 긍정률 평균)\n` + a.items.map((x: { id: string; domain_id: string; pos: number; mean: number; text: string }) => `- ${x.id} ${x.domain_id} ${x.pos}% ${x.mean} ${x.text}`).join('\n'),
    `# 인구통계별 (5명 미만 숨김)\n${heatText || '(구분 정보 없음)'}`,
    `# 선택형\n` + a.choices.map((c: { text: string; n: number; ranks: { label: string; pct: number }[] }) => `- ${c.text} (n=${c.n}): ` + c.ranks.slice(0, 6).map((r) => `${r.label} ${r.pct}%`).join(', ')).join('\n'),
    `# 주관식 원문 (익명, 일부)\n` + texts.map((t) => `## ${t.id} ${t.text}\n` + t.answers.slice(0, 120).map((s) => `- ${s.slice(0, 200)}`).join('\n')).join('\n'),
    `# 인터뷰 요약 (${(invites ?? []).length}건)\n` + (invites ?? []).map((i) => `## ${i.track} ${i.label}\n${JSON.stringify(i.summary)}`).join('\n'),
    `# 제도 문서 점검 (${(docs ?? []).length}건)\n` + (docs ?? []).map((x) => {
      // deno-lint-ignore no-explicit-any
      const e = x.extracted as any;
      return `## ${x.name} (${e?.doc_type ?? ''})\n요지: ${e?.summary ?? ''}\n구조: ${(e?.structure ?? []).map((s: { item: string; value: string }) => `${s.item}=${s.value}`).join('; ')}\nCheck Point: ${(e?.checkpoints ?? []).map((c: { id: string; status: string; note: string }) => `${c.id} ${c.status} ${c.note}`).join('; ')}\n리스크: ${(e?.risks ?? []).join('; ')}`;
    }).join('\n'),
    `# HR Maturity (문서 기반, 1~4)\n` + (mat ?? []).map((m) => `- ${m.area_id} / ${m.element}: Lv ${m.level} (${m.evidence})`).join('\n'),
    `# HCG 이슈 라이브러리 (참고)\n` + (lib ?? []).map((l) => `- ${l.id} [${l.domain_id}] ${l.title} | 신호: ${l.signals} | 근인: ${l.root_causes} | 처방: ${l.prescriptions}`).join('\n'),
  ].join('\n\n');

  const r = await callClaude({ model: MODEL_SMART, maxTokens: 14000, system: reportSystem(d?.kind === 'module'), content: [{ type: 'text', text: input }], timeoutMs: 150000, effort: 'medium' });
  await ledger(diagnosis_id, 'ai-report', r);
  const sections = parseJson<Record<string, unknown>>(r.text);

  await admin.from('reports').upsert({ diagnosis_id, sections, status: 'draft', generated_at: new Date().toISOString(), published_at: null, published_by: null });
  if (!['published', 'closed'].includes(d?.status ?? '')) await admin.from('diagnoses').update({ status: 'review' }).eq('id', diagnosis_id);
  return { ok: true };
});
