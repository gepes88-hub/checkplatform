import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Check, Lock, Send, ShieldCheck } from 'lucide-react';
import { fn, errorText } from '../lib/supabase';
import { cx } from '../lib/format';
import { Mark } from '../components/Brand';
import { Button, Spinner } from '../components/ui';

interface Msg { role: 'assistant' | 'user'; content: string }
interface IData { org: string; title: string; track: string; label: string; status: string; messages: Msg[] }

/** AI 인터뷰 — 로그인 없음. 보안 공간 톤의 1:1 대화 */
export default function Interview() {
  const { token = '' } = useParams();
  const [data, setData] = useState<IData | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [started, setStarted] = useState(false);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fn<IData>('interview', { action: 'load', token }).then((d) => { setData(d); setMsgs(d.messages); setDone(d.status === 'done'); setStarted(d.messages.some((m) => m.role === 'user')); })
      .catch((e) => setErr(errorText(e)));
  }, [token]);
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs, busy]);

  const send = async () => {
    const t = text.trim();
    if (!t || busy) return;
    setText(''); setErr(null); setBusy(true);
    setMsgs((m) => [...m, { role: 'user', content: t }]);
    try {
      const r = await fn<{ message: string; done: boolean }>('interview', { action: 'send', token, text: t });
      setMsgs((m) => [...m, { role: 'assistant', content: r.message }]);
      if (r.done) setDone(true);
    } catch (e) { setErr(errorText(e)); } finally { setBusy(false); }
  };
  const finish = async () => {
    setBusy(true);
    try { await fn('interview', { action: 'finish', token }); setDone(true); } catch (e) { setErr(errorText(e)); } finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col">
      <header className="h-12 shrink-0 flex items-center justify-between px-4">
        <div className="flex items-center gap-2"><Mark dark size={24} /><span className="text-xs text-emerald-300 flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400 live-dot" />보안 인터뷰</span></div>
        {data && <span className="text-xs text-slate-400">{data.org} · {data.track}</span>}
      </header>
      <main className="flex-1 min-h-0 px-3 pb-3">
        <div className="max-w-2xl mx-auto h-full rounded-2xl bg-white text-slate-900 flex flex-col overflow-hidden">
          {!data ? (
            <div className="p-8">{err ? <div className="text-center"><Lock className="mx-auto text-slate-400" /><p className="mt-3">{err}</p></div> : <Spinner label="보안 연결 중" />}</div>
          ) : !started && !done ? (
            <div className="p-6 sm:p-8">
              <div className="text-xs text-slate-400">{data.org}</div>
              <h1 className="text-xl font-bold mt-1">조직·인사 진단 인터뷰</h1>
              <p className="text-sm text-slate-500 mt-1">{data.label} · {data.track}</p>
              <div className="mt-5 rounded-xl bg-slate-50 p-4 space-y-2.5 text-sm">
                <div className="flex gap-2.5"><ShieldCheck size={18} className="text-emerald-600 shrink-0" /><span>HCG 진단팀의 AI 컨설턴트가 질문합니다. 15~20분, 편한 시간에 나눠서 해도 됩니다.</span></div>
                <div className="flex gap-2.5"><Lock size={18} className="text-emerald-600 shrink-0" /><span><b>대화 원문은 회사에 전달되지 않습니다.</b> HCG가 여러 분의 의견을 익명으로 종합해 진단에만 씁니다.</span></div>
                <div className="flex gap-2.5"><Check size={18} className="text-emerald-600 shrink-0" /><span>다른 사람의 실명은 말하지 않으셔도 됩니다. 구체적인 사례일수록 도움이 됩니다.</span></div>
              </div>
              <Button className="w-full mt-6" onClick={() => setStarted(true)}>인터뷰 시작</Button>
            </div>
          ) : (
            <>
              <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-3" style={{ maxHeight: 'calc(100vh - 11rem)' }}>
                {msgs.map((m, i) => (
                  <div key={i} className={cx('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
                    <div className={cx('max-w-[85%] rounded-2xl px-4 py-2.5 text-[15px] leading-relaxed whitespace-pre-line', m.role === 'user' ? 'bg-indigo-600 text-white rounded-br-md' : 'bg-slate-100 text-slate-800 rounded-bl-md')}>{m.content}</div>
                  </div>
                ))}
                {busy && <div className="flex"><div className="bg-slate-100 rounded-2xl px-4 py-3 text-slate-400 text-sm">답변을 정리하고 있습니다…</div></div>}
                {done && <div className="text-center text-sm text-emerald-700 py-4"><Check className="inline mr-1" size={16} />인터뷰가 끝났습니다. 참여해 주셔서 감사합니다.</div>}
                <div ref={end} />
              </div>
              {err && <div className="mx-4 mb-2 rounded-lg bg-rose-50 text-rose-800 text-sm px-3 py-2">{err}</div>}
              {!done && (
                <div className="border-t border-slate-100 p-3 flex gap-2 items-end">
                  <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(); } }}
                    placeholder="답변을 입력하세요 (Shift+Enter 줄바꿈)" className="flex-1 resize-none text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:border-indigo-400" />
                  <div className="flex flex-col gap-1.5">
                    <Button onClick={send} disabled={!text.trim()} loading={busy}><Send size={14} /></Button>
                    <button onClick={finish} disabled={busy} className="text-[11px] text-slate-400 hover:text-slate-700">마치기</button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
