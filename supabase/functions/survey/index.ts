// 직원 설문 (로그인 없음 · Verify JWT 끔) — 진단별 설문 링크 토큰으로만 접근
//   load   : 설문 문항·응답자 정보 보기 (조직 목록 등)
//   submit : 응답 저장 (익명 — 이름·이메일·IP 저장하지 않음)
import { serve, readJson, HttpError } from '../_shared/http.ts';
import { admin } from '../_shared/supabase.ts';

interface Body { action: 'load' | 'submit'; token: string; demo?: Record<string, string>; answers?: Record<string, unknown> }

serve(async (req) => {
  const b = await readJson<Body>(req);
  if (!b.token || typeof b.token !== 'string') throw new HttpError(400, 'MISSING_TOKEN');
  const { data: d } = await admin.from('diagnoses').select('id, title, kind, modules, settings, survey_open, status, org_id, orgs(name)')
    .eq('survey_token', b.token).maybeSingle();
  if (!d) throw new HttpError(404, 'NOT_FOUND', '설문을 찾을 수 없습니다. 링크를 다시 확인해 주세요.');
  if (!d.survey_open) throw new HttpError(403, 'CLOSED', '지금은 응답을 받고 있지 않습니다.');

  const { data: rows } = await admin.from('diagnosis_items').select('sort, items(id, domain_id, sub, text, kind, options, max_pick, domains(name, layer))')
    .eq('diagnosis_id', d.id).order('sort');
  // deno-lint-ignore no-explicit-any
  const items = (rows ?? []).map((r: any) => r.items).filter(Boolean);
  const seg = (d.settings as { segments?: Record<string, unknown> })?.segments ?? {};
  const segments = Object.fromEntries(Object.entries(seg).map(([k, v]) => [k, k === 'unit' ? (v as { name: string }[]).map((u) => u.name) : v]));

  if (b.action === 'load') {
    return {
      title: d.title,
      // deno-lint-ignore no-explicit-any
      org: (d as any).orgs?.name ?? '',
      kind: d.kind,
      intro: (d.settings as { intro?: string })?.intro ?? null,
      segments,
      // deno-lint-ignore no-explicit-any
      items: items.map((i: any) => ({ id: i.id, domain: i.domains?.name, layer: i.domains?.layer, sub: i.sub, text: i.text, kind: i.kind, options: i.options, max_pick: i.max_pick })),
    };
  }

  if (b.action === 'submit') {
    const answers = b.answers ?? {};
    const demo = b.demo ?? {};
    // 응답 검증: 진단 문항만, 리커트는 1~5, 선택형은 보기 안에서
    const clean: Record<string, unknown> = {};
    // deno-lint-ignore no-explicit-any
    for (const i of items as any[]) {
      const v = answers[i.id];
      if (v == null || v === '') continue;
      if (i.kind === 'likert') { const n = Number(v); if (n >= 1 && n <= 5) clean[i.id] = Math.round(n); }
      else if (i.kind === 'choice') { if ((i.options ?? []).includes(v)) clean[i.id] = v; }
      else if (i.kind === 'multi') { const arr = [...new Set(Array.isArray(v) ? v : [])].filter((x) => (i.options ?? []).includes(x)).slice(0, i.max_pick ?? 99); if (arr.length) clean[i.id] = arr; }
      else if (i.kind === 'text') { clean[i.id] = String(v).slice(0, 2000); }
    }
    const likertTotal = (items as { kind: string }[]).filter((i) => i.kind === 'likert').length;
    const likertDone = Object.entries(clean).filter(([id]) => (items as { id: string; kind: string }[]).find((i) => i.id === id)?.kind === 'likert').length;
    if (likertTotal && likertDone < likertTotal * 0.8) throw new HttpError(422, 'INCOMPLETE', '응답하지 않은 문항이 많습니다. 객관식 문항에 모두 답해 주세요.');
    const cleanDemo: Record<string, string> = {};
    for (const [k, opts] of Object.entries(segments)) {
      const v = demo[k];
      if (typeof v === 'string' && Array.isArray(opts) && (opts as string[]).includes(v)) cleanDemo[k] = v;
    }
    const { error } = await admin.from('survey_responses').insert({ diagnosis_id: d.id, demo: cleanDemo, answers: clean });
    if (error) throw error;
    if (d.status === 'setup') await admin.from('diagnoses').update({ status: 'collecting' }).eq('id', d.id);
    return { ok: true };
  }
  throw new HttpError(400, 'BAD_ACTION');
});
