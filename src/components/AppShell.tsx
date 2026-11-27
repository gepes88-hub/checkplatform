import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LogOut, ShieldCheck } from 'lucide-react';
import { Brand } from './Brand';
import { supabase } from '../lib/supabase';
import { useSession } from '../state/session';

/** 보안 공간 바깥 — 진단 목록·새 진단·셀프 체크 화면의 기본 틀 */
export function AppShell({ children }: { children: ReactNode }) {
  const { profile } = useSession();
  const nav = useNavigate();
  return (
    <div className="min-h-screen">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-5 h-16 flex items-center justify-between gap-4">
          <Link to="/"><Brand /></Link>
          <div className="flex items-center gap-3 text-sm">
            {profile?.is_hcg && <Link to="/admin" className="inline-flex items-center gap-1.5 text-indigo-700 font-semibold"><ShieldCheck size={15} />HCG 콘솔</Link>}
            {profile && <span className="text-slate-500 hidden sm:inline">{profile.full_name ?? profile.email}</span>}
            {profile && (
              <button className="text-slate-400 hover:text-slate-700" aria-label="로그아웃"
                onClick={async () => { await supabase.auth.signOut(); nav('/login'); }}><LogOut size={16} /></button>
            )}
          </div>
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-5 py-8">{children}</main>
    </div>
  );
}
