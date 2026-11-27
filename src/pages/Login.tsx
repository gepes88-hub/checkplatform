import { useState } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { supabase, isConfigured } from '../lib/supabase';
import { useSession } from '../state/session';
import { Brand } from '../components/Brand';
import { Button, ErrorBox, Field, inputCls } from '../components/ui';

export default function Login() {
  const { session } = useSession();
  const loc = useLocation();
  const next = (loc.state as { from?: string } | null)?.from ?? '/';
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const [sent, setSent] = useState(false);

  if (session) return <Navigate to={next} replace />;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      if (mode === 'in') {
        const { error } = await supabase.auth.signInWithPassword({ email, password: pw });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({ email, password: pw, options: { data: { full_name: name }, emailRedirectTo: window.location.origin } });
        if (error) throw error;
        setSent(true);
      }
    } catch (e) { setErr(e); } finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      <div className="hidden lg:flex flex-col justify-between bg-slate-950 text-white p-12">
        <Brand dark />
        <div>
          <div className="text-xs tracking-[0.2em] text-emerald-300 mb-3">HCG DIAGNOSTIC PLATFORM</div>
          <h1 className="text-3xl font-bold leading-snug">4주 걸리던 조직·인사 진단을<br />2주 만에, HCG 방법론 그대로.</h1>
          <p className="text-slate-400 mt-4 leading-relaxed">직원 설문 · AI 인터뷰 · 제도 문서 점검을 한 공간에서.<br />결과는 이슈 · 근본 원인 · 개선 방향까지.</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500"><ShieldCheck size={14} />개별 응답과 인터뷰 원문은 HCG만 열람합니다</div>
      </div>
      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="lg:hidden mb-8"><Brand /></div>
          <h2 className="text-xl font-bold">{mode === 'in' ? '로그인' : '회원가입'}</h2>
          {!isConfigured && <div className="mt-3 text-xs rounded-lg bg-amber-50 text-amber-800 px-3 py-2">.env 에 VITE_SUPABASE_URL · VITE_SUPABASE_ANON_KEY 를 넣어야 합니다.</div>}
          {sent ? (
            <div className="mt-6 rounded-xl bg-emerald-50 text-emerald-900 text-sm p-4">확인 메일을 보냈습니다. 메일의 링크를 누른 뒤 로그인해 주세요.</div>
          ) : (
            <form onSubmit={submit} className="mt-6 space-y-4">
              {mode === 'up' && <Field label="이름"><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} required /></Field>}
              <Field label="회사 이메일"><input className={inputCls} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" /></Field>
              <Field label="비밀번호" hint={mode === 'up' ? '8자 이상' : undefined}><input className={inputCls} type="password" minLength={8} value={pw} onChange={(e) => setPw(e.target.value)} required autoComplete={mode === 'in' ? 'current-password' : 'new-password'} /></Field>
              <ErrorBox error={err} />
              <Button type="submit" loading={busy} className="w-full">{mode === 'in' ? '로그인' : '가입하기'}</Button>
            </form>
          )}
          <button type="button" className="w-full mt-3 text-sm border border-slate-200 rounded-lg py-2 hover:bg-slate-50"
            onClick={() => supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } })}>Google로 계속하기</button>
          <div className="mt-6 text-sm text-slate-500 text-center">
            {mode === 'in' ? <>처음이신가요? <button className="text-indigo-700 font-semibold" onClick={() => setMode('up')}>회원가입</button></>
              : <>이미 계정이 있나요? <button className="text-indigo-700 font-semibold" onClick={() => setMode('in')}>로그인</button></>}
          </div>
          <div className="mt-8 rounded-xl border border-slate-200 bg-white p-4 text-sm">
            <div className="font-semibold">먼저 15분 셀프 체크로 시작해 보세요</div>
            <p className="text-slate-500 mt-1">로그인 없이 우리 회사 인사제도의 약한 곳을 확인합니다.</p>
            <Link to="/self-check" className="inline-block mt-2 text-indigo-700 font-semibold">셀프 체크 하기 →</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
