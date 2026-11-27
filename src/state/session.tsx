import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { Profile } from '../lib/types';

interface Ctx { session: Session | null; profile: Profile | null; loading: boolean; refresh: () => Promise<void> }
const SessionCtx = createContext<Ctx>({ session: null, profile: null, loading: true, refresh: async () => {} });

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = async (s: Session | null) => {
    if (!s) { setProfile(null); return; }
    const { data } = await supabase.from('profiles').select('id, email, full_name, is_hcg').eq('id', s.user.id).maybeSingle();
    setProfile((data as Profile) ?? { id: s.user.id, email: s.user.email ?? null, full_name: null, is_hcg: false });
  };

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => { setSession(data.session); await loadProfile(data.session); setLoading(false); });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => { setSession(s); void loadProfile(s); });
    return () => sub.subscription.unsubscribe();
  }, []);

  return <SessionCtx.Provider value={{ session, profile, loading, refresh: () => loadProfile(session) }}>{children}</SessionCtx.Provider>;
}

export const useSession = () => useContext(SessionCtx);
