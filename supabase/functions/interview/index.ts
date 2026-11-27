// AI 인터뷰 (로그인 없음 · Verify JWT 끔) — 인터뷰 초대 토큰으로만 접근
//   load   : 인터뷰 정보와 지금까지의 대화 (처음이면 인사말 + 첫 질문을 만든다)
//   send   : 응답 저장 → AI 컨설턴트가 다음 질문
//   finish : 인터뷰 종료 → 요약 저장 (원문은 HCG만, 고객사는 요약만 본다)
import { serve, readJson, HttpError } from '../_shared/http.ts';
import { admin, ledger } from '../_shared/supabase.ts';
import { callClaude, parseJson, MODEL_SMART, MODEL_FAST } from '../_shared/anthropic.ts';
import { interviewSystem, INTERVIEW_SUMMARY, TRACK_LABEL } from '../_shared/prompts.ts';

interface Body { action: 'load' | 'send' | 'finish'; token: string; text?: string }
const MAX_TURNS = 30;

serve(async (req) => {
  const b = await readJson<Body>(req);
  if (!b.token) throw new HttpError(400, 'MISSING_TOKEN');
  const { data: inv } = await admin.from('interview_invites').select('id, diagnosis_id, track, label, status, summary').eq('token', b.token).maybeSingle();
  if (!inv) throw new HttpError(404, 'NOT_FOUND', '인터뷰를 찾을 수 없습니다. 링크를 다시 확인해 주세요.');
  const { data: d } = await admin.from('diagnoses').select('id, title, modules, status, orgs(name)').eq('id', inv.diagnosis_id).single();
  // deno-lint-ignore no-explicit-any
  const org = (d as any)?.orgs?.name ?? '';
  if (['published', 'closed'].includes(d?.status ?? '')) throw new HttpError(403, 'CLOSED', '진단이 끝나 인터뷰를 진행할 수 없습니다.');

  const history = async () => (await admin.from('interview_messages').select('role, content, created_at').eq('invite_id', inv.id).order('id')).data ?? [];

  const guides = async () => {
    const mods = ['core', ...((d?.modules as string[]) ?? [])];
    const { data } = await admin.from('interview_guides').select('domain_id, question, intent, sort, domains(name)').eq('track', inv.track).in('module', mods).order('sort');
    // deno-lint-ignore no-explicit-any
    return (data ?? []).map((g: any) => ({ domain: g.domains?.name ?? g.domain_id, question: g.question, intent: g.intent }));
  };

  if (b.action === 'load') {
    let msgs = await history();
    if (!msgs.length && inv.status === 'invited') {
      const g = await guides();
      const first = `안녕하세요. HCG 진단팀입니다. ${org} 조직·인사 진단을 위한 인터뷰에 참여해 주셔서 감사합니다.\n\n지금부터 15~20분 정도 편하게 말씀 나누겠습니다. 응답은 익명으로 종합되어 진단에만 쓰이고, 개별 원문은 회사에 전달되지 않습니다.\n\n첫 질문입니다. ${g[0]?.question ?? '현재 담당하고 계신 조직과 업무를 간단히 소개해 주시겠어요?'}`;
      await admin.from('interview_messages').insert({ invite_id: inv.id, role: 'assistant', content: first });
      await admin.from('interview_invites').update({ status: 'started' }).eq('id', inv.id);
      msgs = await history();
    }
    return { org, title: d?.title, track: TRACK_LABEL[inv.track], label: inv.label, status: inv.status === 'invited' ? 'started' : inv.status, messages: msgs };
  }

  if (inv.status === 'done') throw new HttpError(409, 'DONE', '이미 끝난 인터뷰입니다.');

  if (b.action === 'send') {
    const text = (b.text ?? '').trim().slice(0, 4000);
    if (!text) throw new HttpError(400, 'EMPTY');
    const before = await history();
    if (before.filter((m) => m.role === 'user').length >= MAX_TURNS) throw new HttpError(429, 'TOO_LONG', '인터뷰가 충분히 길어 마무리합니다. [인터뷰 마치기]를 눌러 주세요.');
    await admin.from('interview_messages').insert({ invite_id: inv.id, role: 'user', content: text });
    const msgs = [...before, { role: 'user', content: text }];
    const r = await callClaude({
      model: MODEL_SMART, maxTokens: 800, thinking: 'fast', timeoutMs: 45000,
      system: interviewSystem({ org, track: inv.track, label: inv.label, guides: await guides(), modules: (d?.modules as string[]) ?? [] }),
      content: [],
      messages: msgs.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    });
    await ledger(inv.diagnosis_id, 'interview', r);
    let out: { message: string; done?: boolean };
    try { out = parseJson(r.text); } catch { out = { message: r.text.trim(), done: false }; }
    await admin.from('interview_messages').insert({ invite_id: inv.id, role: 'assistant', content: out.message });
    if (out.done) await summarize(inv.id, inv.diagnosis_id, inv.track);
    return { message: out.message, done: Boolean(out.done) };
  }

  if (b.action === 'finish') {
    await summarize(inv.id, inv.diagnosis_id, inv.track);
    return { ok: true };
  }
  throw new HttpError(400, 'BAD_ACTION');
});

async function summarize(inviteId: string, diagnosisId: string, track: string) {
  const { data: msgs } = await admin.from('interview_messages').select('role, content').eq('invite_id', inviteId).order('id');
  const transcript = (msgs ?? []).map((m) => `${m.role === 'user' ? '응답자' : '컨설턴트'}: ${m.content}`).join('\n');
  let summary: unknown = { key_points: [], themes: [], one_line: '응답이 짧아 요약할 내용이 없습니다.' };
  if ((msgs ?? []).some((m) => m.role === 'user')) {
    const r = await callClaude({ model: MODEL_FAST, maxTokens: 2000, thinking: 'fast', system: INTERVIEW_SUMMARY, content: [{ type: 'text', text: `대상: ${TRACK_LABEL[track]}\n\n${transcript}` }] });
    await ledger(diagnosisId, 'interview-summary', r);
    summary = parseJson(r.text);
  }
  await admin.from('interview_invites').update({ status: 'done', summary, finished_at: new Date().toISOString() }).eq('id', inviteId);
}
