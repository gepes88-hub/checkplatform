import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isConfigured = Boolean(url && anon);
export const SUPABASE_URL = url ?? 'http://localhost:54321';
export const SUPABASE_ANON = anon ?? 'public-anon-key';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

export class AppError extends Error {
  constructor(message: string, public code?: string) { super(message); }
}

/** supabase 응답에서 data를 꺼내고 error면 throw */
export async function q<T>(p: PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw new AppError(error.message, error.code);
  return data as T;
}

/** Edge Function 호출. 로그인 사용자면 토큰을, 아니면 anon 키를 보낸다 (함수는 모두 Verify JWT 끔) */
export async function fn<T>(name: string, body: unknown): Promise<T> {
  const { data: s } = await supabase.auth.getSession();
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON, Authorization: `Bearer ${s.session?.access_token ?? SUPABASE_ANON}` },
    body: JSON.stringify(body),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new AppError(j.message ?? j.error ?? `요청 실패 (${res.status})`, j.error);
  return j as T;
}

const KNOWN: Record<string, string> = {
  forbidden: '권한이 없습니다.',
  UNAUTHENTICATED: '로그인이 필요합니다.',
  AI_NOT_CONFIGURED: 'AI 키가 설정되지 않았습니다 (Supabase secrets: ANTHROPIC_API_KEY).',
  'Failed to fetch': '서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.',
};

export function errorText(e: unknown): string {
  const msg = e instanceof Error ? e.message
    : e && typeof e === 'object' && typeof (e as { message?: unknown }).message === 'string' ? (e as { message: string }).message
    : typeof e === 'string' ? e : '처리하지 못했습니다. 잠시 후 다시 시도해 주세요.';
  for (const [k, v] of Object.entries(KNOWN)) if (msg.includes(k)) return v;
  const m = /^[A-Z][A-Z0-9_]+: (.+)$/s.exec(msg);
  return m ? m[1] : msg;
}
