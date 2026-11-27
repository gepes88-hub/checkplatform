import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { NavLink, Outlet, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BarChart3, ClipboardList, FileText, FolderLock, LayoutGrid, Lock, LogOut, MessagesSquare, ScrollText, ShieldCheck, Check } from 'lucide-react';
import { supabase, q } from '../../lib/supabase';
import { cx, fmtDate } from '../../lib/format';
import { STATUS_LABEL, type Diagnosis } from '../../lib/types';
import { useSession } from '../../state/session';
import { Mark } from '../Brand';
import { Spinner, ErrorBox } from '../ui';

/* 보안 진단 공간
   - 들어올 때: 권한 확인 → 데이터 격리 공간 연결 → 접근 기록 시작 (짧은 개방 연출)
   - 안에서는: 어두운 프레임 + 세션 코드 + 접근 기록 + 일정 시간 자리를 비우면 화면 잠금
   - 나갈 때: 기록 남기고 목록으로 */

interface RoomCtx { diag: Diagnosis; refresh: () => void; isHcg: boolean; viewer: string }
const Ctx = createContext<RoomCtx | null>(null);
export const useRoom = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error('useRoom outside SecureRoom');
  return c;
};

const IDLE_MS = 10 * 60 * 1000;

export async function logAccess(diagnosisId: string, action: string) {
  const { data } = await supabase.auth.getUser();
  if (!data.user) return;
  await supabase.from('access_log').insert({ diagnosis_id: diagnosisId, user_id: data.user.id, action });
}

export function SecureRoom() {
  const { id } = useParams<{ id: string }>();
  const { profile } = useSession();
  const qc = useQueryClient();
  const nav = useNavigate();
  const d = useQuery({
    queryKey: ['diag', id],
    queryFn: () => q<Diagnosis>(supabase.from('diagnoses').select('*, orgs(id, name, industry, employee_count)').eq('id', id!).single()),
    enabled: Boolean(id),
  });
  const [opened, setOpened] = useState(false);
  const [locked, setLocked] = useState(false);
  const lastActive = useRef(Date.now());

  // 입장 기록
  useEffect(() => {
    if (!d.data) return;
    void logAccess(d.data.id, 'enter');
  }, [d.data?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // 자리 비움 잠금
  useEffect(() => {
    const touch = () => { lastActive.current = Date.now(); };
    const evs = ['mousemove', 'keydown', 'scroll', 'touchstart'];
    evs.forEach((e) => window.addEventListener(e, touch, { passive: true }));
    const t = window.setInterval(() => {
      if (!locked && Date.now() - lastActive.current > IDLE_MS) { setLocked(true); if (d.data) void logAccess(d.data.id, 'lock'); }
    }, 15000);
    return () => { evs.forEach((e) => window.removeEventListener(e, touch)); window.clearInterval(t); };
  }, [locked, d.data]);

  const exit = useCallback(async () => {
    if (d.data) await logAccess(d.data.id, 'exit');
    nav('/');
  }, [d.data, nav]);

  if (d.isLoading) return <div className="min-h-screen bg-slate-950 flex items-center justify-center"><div className="text-slate-400"><Spinner label="보안 공간 확인 중" /></div></div>;
  if (d.error || !d.data) return <div className="min-h-screen bg-slate-950 p-10"><div className="max-w-md mx-auto"><ErrorBox error={d.error ?? '진단을 찾을 수 없거나 접근 권한이 없습니다.'} /></div></div>;

  const diag = d.data;
  const viewer = profile?.email ?? '';
  const nav_items = [
    { to: '', end: true, icon: <LayoutGrid size={16} />, label: '개요' },
    { to: 'design', icon: <ClipboardList size={16} />, label: '진단 설계' },
    { to: 'survey', icon: <ScrollText size={16} />, label: '직원 설문' },
    { to: 'interviews', icon: <MessagesSquare size={16} />, label: 'AI 인터뷰' },
    { to: 'documents', icon: <FolderLock size={16} />, label: '제도 문서' },
    { to: 'analysis', icon: <BarChart3 size={16} />, label: '분석' },
    { to: 'report', icon: <FileText size={16} />, label: '리포트' },
  ];

  return (
    <Ctx.Provider value={{ diag, refresh: () => qc.invalidateQueries({ queryKey: ['diag', id] }), isHcg: Boolean(profile?.is_hcg), viewer }}>
      {!opened && <Gate code={diag.code} org={diag.orgs?.name ?? ''} onDone={() => setOpened(true)} />}
      <div className={cx('min-h-screen bg-slate-950 text-slate-100 flex flex-col', opened && 'vault-open')}>
        {/* 상단 보안 바 */}
        <header className="h-14 shrink-0 border-b border-white/10 flex items-center gap-4 px-4 sm:px-5">
          <Mark dark size={26} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-[11px] text-emerald-300/90 tracking-wide">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 live-dot" />보안 진단 공간 <span className="mono text-slate-400">· SESSION {diag.code}</span>
            </div>
            <div className="text-sm font-semibold truncate">{diag.orgs?.name} <span className="text-slate-400 font-normal">/ {diag.title}</span></div>
          </div>
          <span className="hidden md:inline-flex text-xs rounded-full border border-white/15 px-2.5 py-1 text-slate-300">{STATUS_LABEL[diag.status]}</span>
          <button onClick={() => { setLocked(true); void logAccess(diag.id, 'lock'); }} className="hidden sm:inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white" title="화면 잠그기"><Lock size={14} />잠금</button>
          <button onClick={exit} className="inline-flex items-center gap-1.5 text-xs rounded-lg bg-white/10 hover:bg-white/15 px-3 py-1.5"><LogOut size={14} />공간 나가기</button>
        </header>

        <div className="flex-1 flex min-h-0">
          {/* 왼쪽 메뉴 */}
          <nav className="w-14 lg:w-52 shrink-0 border-r border-white/10 py-4 px-2 flex flex-col gap-1">
            {nav_items.map((n) => (
              <NavLink key={n.label} to={n.to} end={n.end}
                className={({ isActive }) => cx('flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm justify-center lg:justify-start',
                  isActive ? 'bg-white/10 text-white font-semibold' : 'text-slate-400 hover:text-white hover:bg-white/5')}>
                {n.icon}<span className="hidden lg:inline">{n.label}</span>
              </NavLink>
            ))}
            <div className="mt-auto hidden lg:block text-[11px] leading-relaxed text-slate-500 px-2.5 pt-4 border-t border-white/10">
              <div className="flex items-center gap-1.5 text-slate-400 mb-1"><ShieldCheck size={13} />이 공간의 원칙</div>
              개별 설문 응답과 인터뷰 원문은 HCG만 봅니다. 회사는 집계와 요약만 봅니다. 모든 입장은 기록됩니다.
            </div>
          </nav>

          {/* 본문 — 밝은 작업면 (격리된 칸 느낌의 프레임) */}
          <main className="flex-1 min-w-0 p-2 sm:p-3">
            <div className="h-full rounded-2xl bg-slate-50 text-slate-900 ring-1 ring-white/10 overflow-y-auto">
              <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6"><Outlet /></div>
            </div>
          </main>
        </div>

        <footer className="h-8 shrink-0 text-[11px] text-slate-500 flex items-center justify-between px-5 border-t border-white/10">
          <span className="mono">{viewer} · {fmtDate(new Date().toISOString())}</span>
          <span className="hidden sm:inline">전송 구간 암호화 · 접근 기록 중 · 10분간 활동이 없으면 화면이 잠깁니다</span>
        </footer>
      </div>

      {locked && (
        <div className="fixed inset-0 z-[70] backdrop-blur-xl bg-slate-950/70 flex items-center justify-center p-6">
          <div className="text-center text-white max-w-sm">
            <div className="mx-auto w-14 h-14 rounded-2xl bg-white/10 flex items-center justify-center mb-4"><Lock size={24} /></div>
            <div className="font-semibold text-lg">보안 공간이 잠겼습니다</div>
            <p className="text-sm text-slate-300 mt-1.5">자리를 비운 동안 진단 내용이 보이지 않도록 화면을 가렸습니다.</p>
            <button className="mt-5 rounded-lg bg-white text-slate-900 font-semibold text-sm px-4 py-2"
              onClick={() => { lastActive.current = Date.now(); setLocked(false); void logAccess(diag.id, 'unlock'); }}>계속하기</button>
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}

/** 입장 연출: 세 단계가 차례로 확인되고 공간이 열린다 (약 1.6초) */
function Gate({ code, org, onDone }: { code: string; org: string; onDone: () => void }) {
  const steps = ['접근 권한 확인', '진단 데이터 격리 공간 연결', `접근 기록 시작 · SESSION ${code}`];
  const [n, setN] = useState(0);
  useEffect(() => {
    const ts = steps.map((_, i) => window.setTimeout(() => setN(i + 1), 380 * (i + 1)));
    const end = window.setTimeout(onDone, 380 * steps.length + 450);
    return () => { ts.forEach(clearTimeout); clearTimeout(end); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="fixed inset-0 z-[80] bg-slate-950 text-white flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-3 mb-6">
          <Mark dark size={36} />
          <div>
            <div className="text-xs text-emerald-300 tracking-[0.2em]">SECURE DIAGNOSTIC SPACE</div>
            <div className="font-semibold">{org} 진단 공간에 들어갑니다</div>
          </div>
        </div>
        <div className="relative h-1 rounded-full bg-white/10 overflow-hidden mb-5 vault-scan" />
        <ul className="space-y-2.5 text-sm">
          {steps.map((s, i) => (
            <li key={s} className={cx('flex items-center gap-2.5', i < n ? 'vault-line text-slate-100' : 'text-slate-600')}>
              <span className={cx('w-5 h-5 rounded-full flex items-center justify-center', i < n ? 'bg-emerald-400/20 text-emerald-300' : 'bg-white/5')}>
                {i < n ? <Check size={12} strokeWidth={3} /> : null}
              </span>
              <span className={i === 2 ? 'mono text-[13px]' : ''}>{s}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** 리포트·분석 화면 위에 보는 사람·시각을 옅게 깔아 캡처 유출을 억제 */
export function Watermark({ text }: { text: string }) {
  const rows = Array.from({ length: 14 });
  return (
    <div className="watermark" aria-hidden="true">
      {rows.map((_, r) => Array.from({ length: 4 }).map((__, c) => (
        <span key={`${r}-${c}`} style={{ top: `${r * 260}px`, left: `${c * 340 - (r % 2) * 170}px` }}>{text}</span>
      )))}
    </div>
  );
}

export function RoomTitle({ title, sub, right }: { title: ReactNode; sub?: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {sub && <p className="text-sm text-slate-500 mt-1">{sub}</p>}
      </div>
      {right && <div className="flex gap-2 flex-wrap">{right}</div>}
    </div>
  );
}
