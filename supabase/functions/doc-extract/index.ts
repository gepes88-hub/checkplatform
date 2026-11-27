// 제도 문서 분석 (로그인 사용자 · Verify JWT 끔, 함수 안에서 사용자 확인)
//   문서 1건 → 제도 구조표 · HR Maturity 판정 · HCG Check Point 점검 · 리스크
import { serve, readJson, HttpError } from '../_shared/http.ts';
import { admin, getCaller, assertDiag, ledger } from '../_shared/supabase.ts';
import { callClaude, parseJson, toBase64, MODEL_SMART, type Block } from '../_shared/anthropic.ts';
import { docSystem } from '../_shared/prompts.ts';

interface Out {
  doc_type?: string; summary?: string; structure?: { item: string; value: string }[];
  maturity?: { area: string; element: string; level: number; evidence: string }[];
  checkpoints?: { id: string; status: 'ok' | 'gap'; note: string }[]; risks?: string[];
}

serve(async (req) => {
  const { document_id } = await readJson<{ document_id: string }>(req);
  const caller = await getCaller(req);
  const { data: doc } = await admin.from('documents').select('*').eq('id', document_id).maybeSingle();
  if (!doc) throw new HttpError(404, 'NOT_FOUND');
  await assertDiag(caller, doc.diagnosis_id);
  const { data: d } = await admin.from('diagnoses').select('modules').eq('id', doc.diagnosis_id).single();

  await admin.from('documents').update({ status: 'extracting', error: null }).eq('id', doc.id);
  try {
    const content: Block[] = [];
    if (doc.text_content && doc.text_content.trim().length > 50) {
      content.push({ type: 'text', text: `문서명: ${doc.name}\n\n${doc.text_content.slice(0, 60000)}` });
    } else if ((doc.mime ?? '').includes('pdf') || doc.name.toLowerCase().endsWith('.pdf')) {
      const { data: file, error } = await admin.storage.from('diag-docs').download(doc.path);
      if (error || !file) throw new HttpError(500, 'DOWNLOAD_FAILED', '문서를 읽지 못했습니다');
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (bytes.length > 20 * 1024 * 1024) throw new HttpError(413, 'TOO_LARGE', '20MB 이하 PDF만 분석할 수 있습니다');
      content.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: toBase64(bytes) }, title: doc.name });
      content.push({ type: 'text', text: `문서명: ${doc.name}` });
    } else {
      throw new HttpError(415, 'UNSUPPORTED', 'PDF, Word(docx), 텍스트 문서만 분석할 수 있습니다. HWP는 PDF로 저장해서 올려 주세요.');
    }

    const mods = ['core', ...((d?.modules as string[]) ?? [])];
    const { data: areas } = await admin.from('maturity_areas').select('id, name, elements, levels').order('sort');
    const { data: cps } = await admin.from('checkpoints').select('id, area, text').in('module', mods).order('sort');
    const r = await callClaude({ model: MODEL_SMART, maxTokens: 6000, system: docSystem({ areas: areas ?? [], checkpoints: cps ?? [] }), content, timeoutMs: 140000 });
    await ledger(doc.diagnosis_id, 'doc-extract', r);
    const out = parseJson<Out>(r.text);

    // Maturity 판정 저장 (같은 요소는 최신 문서 판정으로 덮어씀)
    const valid = new Map((areas ?? []).map((a) => [a.id, a.elements as string[]]));
    const rows = (out.maturity ?? [])
      .filter((m) => valid.get(m.area)?.includes(m.element) && m.level >= 1 && m.level <= 4)
      .map((m) => ({ diagnosis_id: doc.diagnosis_id, area_id: m.area, element: m.element, level: Math.round(m.level * 2) / 2, evidence: `${doc.name}: ${m.evidence}`.slice(0, 600), source: doc.id }));
    if (rows.length) await admin.from('maturity_scores').upsert(rows);

    await admin.from('documents').update({ status: 'done', extracted: out }).eq('id', doc.id);
    return { ok: true, maturity: rows.length, checkpoints: out.checkpoints?.length ?? 0 };
  } catch (e) {
    await admin.from('documents').update({ status: 'failed', error: e instanceof Error ? e.message.slice(0, 300) : String(e) }).eq('id', doc.id);
    throw e;
  }
});
