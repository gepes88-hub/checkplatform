import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Check, Lock, ShieldCheck } from 'lucide-react';
import { fn, errorText } from '../lib/supabase';
import { cx } from '../lib/format';
import { DIM_LABEL } from '../lib/types';
import { Mark } from '../components/Brand';
import { Button, Spinner } from '../components/ui';

interface SItem { id: string; domain: string; layer: string; sub: string | null; text: string; kind: 'likert' | 'choice' | 'multi' | 'text'; options: string[] | null; max_pick: number | null }
interface SData { title: string; org: string; kind: string; intro: string | null; segments: Record<string, string[]>; items: SItem[] }
const SCALE = ['전혀 그렇지 않다', '그렇지 않다', '보통이다', '그렇다', '매우 그렇다'];

/** 응답자 화면 — 로그인 없음. 진단 공간과 같은 '보안 공간' 톤으로, 익명성을 먼저 약속한다 */
export default function Survey() {
  const { token = '' } = useParams();
  const draftKey = `check-draft-${token}`;
  const doneKey = `check-done-${token}`;
  const [data, setData] = useState<SData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [step, setStep] = useState<'intro' | 'demo' | 'q' | 'done'>(() => (localStorage.getItem(doneKey) ? 'done' : 'intro'));
  const [demo, setDemo] = useState<Record<string, string>>({});
  const [ans, setAns] = useState<Record<string, unknown>>(() => { try { return JSON.parse(localStorage.getItem(draftKey) ?? '{}'); } catch { return {}; } });
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => { fn<SData>('survey', { action: 'load', token }).then(setData).catch((e) => setErr(errorText(e))); }, [token]);
  useEffect(() => { try { localStorage.setItem(draftKey, JSON.stringify(ans)); } catch { /* 저장 실패는 무시 */ } }, [ans, draftKey]);

  // 영역 단위로 페이지 나누기 (한 페이지 최대 8문항)
  const pages = useMemo(() => {
    const out: { title: string; items: SItem[] }[] = [];
    for (const it of data?.items ?? []) {
      const last = out[out.length - 1];
      if (last && last.title === it.domain && last.items.length < 8) last.items.push(it);
      else out.push({ title: it.domain, items: [it] });
    }
    return out;
  }, [data]);

  const pageDone = (p: number) => (pages[p]?.items ?? []).every((i) => i.kind === 'text' || i.kind === 'multi' || ans[i.id] != null);
  const progress = pages.length ? Math.round((page / pages.length) * 100) : 0;

  const submit = async () => {
    setBusy(true); setErr(null);
    try {
      await fn('survey', { action: 'submit', token, demo, answers: ans });
      localStorage.setItem(doneKey, '1'); localStorage.removeItem(draftKey);
      setStep('done');
    } catch (e) { setErr(errorText(e)); } finally { setBusy(false); }
  };

  if (err && !data) return <SurveyShell step={step} progress={progress}><div className="text-center py-10"><Lock className="mx-auto text-slate-400" /><p className="mt-3 text-slate-700">{err}</p></div></SurveyShell>;
  if (!data) return <SurveyShell step={step} progress={progress}><Spinner label="보안 연결 중" /></SurveyShell>;

  if (step === 'done') return (
    <SurveyShell step={step} progress={progress}>
      <div className="text-center py-10">
        <div className="mx-auto w-12 h-12 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center"><Check /></div>
        <h1 className="text-xl font-bold mt-4">응답해 주셔서 감사합니다</h1>
        <p className="text-sm text-slate-500 mt-2">응답은 익명으로 저장되었습니다. 이 창을 닫으셔도 됩니다.</p>
      </div>
    </SurveyShell>
  );

  if (step === 'intro') return (
    <SurveyShell step={step} progress={progress}>
      <div className="text-xs text-slate-400">{data.org}</div>
      <h1 className="text-2xl font-bold mt-1">{data.title}</h1>
      {data.intro && <p className="text-sm text-slate-600 mt-4 whitespace-pre-line leading-relaxed">{data.intro}</p>}
      <div className="mt-6 rounded-xl bg-slate-50 p-4 space-y-2.5 text-sm">
        <div className="flex gap-2.5"><ShieldCheck size={18} className="text-emerald-600 shrink-0" /><span><b>익명입니다.</b> 이름·이메일·접속 정보를 저장하지 않습니다.</span></div>
        <div className="flex gap-2.5"><Lock size={18} className="text-emerald-600 shrink-0" /><span><b>회사는 개별 응답을 볼 수 없습니다.</b> 외부 전문기관(HCG)이 분석하고, 회사에는 5명 이상 묶은 통계만 전달됩니다.</span></div>
        <div className="flex gap-2.5"><Check size={18} className="text-emerald-600 shrink-0" /><span>약 {Math.max(5, Math.round(data.items.length * 0.22))}분 · {data.items.length}문항 · 중간에 닫아도 이 기기에서 이어서 할 수 있습니다.</span></div>
      </div>
      <Button className="w-full mt-6" onClick={() => setStep(Object.keys(data.segments).length ? 'demo' : 'q')}>시작하기</Button>
    </SurveyShell>
  );

  if (step === 'demo') return (
    <SurveyShell step={step} progress={progress}>
      <h2 className="text-lg font-bold">기본 정보</h2>
      <p className="text-sm text-slate-500 mt-1">그룹별 비교에만 쓰이며, 5명 미만인 그룹은 결과에서 자동으로 숨겨집니다.</p>
      <div className="mt-5 space-y-5">
        {Object.entries(data.segments).filter(([, opts]) => opts?.length).map(([k, opts]) => (
          <div key={k}>
            <div className="text-sm font-semibold mb-2">{DIM_LABEL[k] ?? k}</div>
            <div className="flex flex-wrap gap-1.5">
              {opts.map((o) => <button key={o} onClick={() => setDemo({ ...demo, [k]: o })} className={cx('text-sm rounded-lg border px-3 py-1.5', demo[k] === o ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-200 hover:border-slate-300')}>{o}</button>)}
            </div>
          </div>
        ))}
      </div>
      <Button className="w-full mt-8" onClick={() => setStep('q')}>다음</Button>
    </SurveyShell>
  );

  const cur = pages[page];
  return (
    <SurveyShell step={step} progress={progress}>
      <div className="text-xs text-indigo-600 font-semibold">{page + 1} / {pages.length} · {cur.title}</div>
      <div className="mt-4 space-y-7">
        {cur.items.map((i) => (
          <div key={i.id}>
            <div className="text-[15px] font-medium leading-relaxed">{i.text}</div>
            {i.kind === 'likert' && (
              <div className="grid grid-cols-5 gap-1.5 mt-3">
                {SCALE.map((label, k) => (
                  <button key={k} onClick={() => setAns({ ...ans, [i.id]: k + 1 })}
                    className={cx('rounded-lg border py-2 text-xs leading-tight', ans[i.id] === k + 1 ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-200 hover:border-slate-300 text-slate-600')}>
                    <span className="block font-bold text-sm num">{k + 1}</span><span className="hidden sm:block mt-0.5">{label}</span>
                  </button>
                ))}
              </div>
            )}
            {i.kind === 'likert' && <div className="sm:hidden flex justify-between text-[10px] text-slate-400 mt-1 px-0.5"><span>전혀 그렇지 않다</span><span>보통</span><span>매우 그렇다</span></div>}
            {i.kind === 'choice' && (
              <div className="mt-3 space-y-1.5">{(i.options ?? []).map((o) => (
                <button key={o} onClick={() => setAns({ ...ans, [i.id]: o })} className={cx('w-full text-left text-sm rounded-lg border px-3 py-2', ans[i.id] === o ? 'border-indigo-600 bg-indigo-50' : 'border-slate-200')}>{o}</button>
              ))}</div>
            )}
            {i.kind === 'multi' && (
              <div className="mt-3 flex flex-wrap gap-1.5">{(i.options ?? []).map((o) => {
                const cur2 = (ans[i.id] as string[] | undefined) ?? [];
                const on = cur2.includes(o);
                return <button key={o} onClick={() => setAns({ ...ans, [i.id]: on ? cur2.filter((x) => x !== o) : cur2.length < (i.max_pick ?? 99) ? [...cur2, o] : cur2 })}
                  className={cx('text-sm rounded-full border px-3 py-1.5', on ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-200')}>{o}</button>;
              })}</div>
            )}
            {i.kind === 'text' && (
              <textarea className="mt-3 w-full h-24 text-sm border border-slate-200 rounded-lg p-3" value={(ans[i.id] as string) ?? ''} onChange={(e) => setAns({ ...ans, [i.id]: e.target.value })} placeholder="특정인을 알아볼 수 있는 내용은 피해 주세요." />
            )}
          </div>
        ))}
      </div>
      {err && <div className="mt-5 rounded-lg bg-rose-50 text-rose-800 text-sm px-3 py-2">{err}</div>}
      <div className="mt-8 flex gap-2">
        {page > 0 && <Button variant="secondary" onClick={() => { setPage(page - 1); window.scrollTo(0, 0); }}>이전</Button>}
        {page < pages.length - 1
          ? <Button className="flex-1" disabled={!pageDone(page)} onClick={() => { setPage(page + 1); window.scrollTo(0, 0); }}>다음</Button>
          : <Button className="flex-1" loading={busy} disabled={!pageDone(page)} onClick={submit}>제출하기</Button>}
      </div>
    </SurveyShell>
  );
}

function SurveyShell({ step, progress, children }: { step: string; progress: number; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-950">
      <header className="h-12 flex items-center justify-between px-4 text-white">
        <div className="flex items-center gap-2"><Mark dark size={24} /><span className="text-xs text-emerald-300 tracking-wide flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400 live-dot" />익명 보안 설문</span></div>
        {step === 'q' && <span className="text-xs text-slate-400 num">{progress}%</span>}
      </header>
      {step === 'q' && <div className="h-0.5 bg-white/10"><div className="h-full bg-emerald-400 transition-all" style={{ width: `${progress}%` }} /></div>}
      <main className="px-3 pb-10 pt-3"><div className="max-w-2xl mx-auto rounded-2xl bg-white text-slate-900 p-5 sm:p-8">{children}</div></main>
    </div>
  );
}
