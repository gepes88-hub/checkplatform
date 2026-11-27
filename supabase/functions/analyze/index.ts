// 설문 분석 (로그인 사용자 · Verify JWT 끔, 함수 안에서 사용자 확인)
//   개별 응답은 서버에서만 읽고, 집계 결과만 analyses 에 저장한다 (고객사는 원응답을 볼 수 없다)
import { serve, readJson, HttpError } from '../_shared/http.ts';
import { admin, getCaller, assertDiag } from '../_shared/supabase.ts';
import { analyze, type StatItem, type StatDomain, type StatResponse } from '../_shared/stats.ts';

serve(async (req) => {
  const { diagnosis_id } = await readJson<{ diagnosis_id: string }>(req);
  const caller = await getCaller(req);
  await assertDiag(caller, diagnosis_id);

  const { data: d } = await admin.from('diagnoses').select('id, status, settings').eq('id', diagnosis_id).single();
  const { data: rows } = await admin.from('diagnosis_items').select('sort, items(id, domain_id, kind, reverse, sub, text, options)').eq('diagnosis_id', diagnosis_id).order('sort');
  // deno-lint-ignore no-explicit-any
  const items = (rows ?? []).map((r: any) => r.items).filter(Boolean) as StatItem[];
  const { data: domains } = await admin.from('domains').select('id, layer, module, name').order('sort');
  const responses: StatResponse[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await admin.from('survey_responses').select('id, demo, answers').eq('diagnosis_id', diagnosis_id).range(from, from + 999);
    if (error) throw error;
    responses.push(...((data ?? []) as StatResponse[]));
    if (!data || data.length < 1000) break;
  }
  if (responses.length < 5) throw new HttpError(422, 'TOO_FEW', `응답이 ${responses.length}건입니다. 익명성을 위해 5건 이상부터 분석합니다.`);

  const { excluded_ids, texts, ...rest } = analyze(items, (domains ?? []) as StatDomain[], responses, (d?.settings as { segments?: Record<string, unknown> })?.segments ?? {});
  // 주관식 원문은 HCG 전용 테이블에, 고객사가 보는 결과에는 문항별 응답 수만
  const result = { ...rest, texts: texts.map((t) => ({ id: t.id, text: t.text, count: t.answers.length })) };
  const now = new Date().toISOString();
  await admin.from('analyses').upsert({ diagnosis_id, result, computed_at: now });
  await admin.from('analyses_private').upsert({ diagnosis_id, texts, computed_at: now });

  // 무성의 응답 표시 갱신 (HCG 원응답 화면용)
  await admin.from('survey_responses').update({ excluded: false }).eq('diagnosis_id', diagnosis_id);
  if (excluded_ids.length) await admin.from('survey_responses').update({ excluded: true }).in('id', excluded_ids);
  if (d?.status === 'collecting' || d?.status === 'setup') await admin.from('diagnoses').update({ status: 'analyzing' }).eq('id', diagnosis_id);
  return { ok: true, counts: result.counts };
});
