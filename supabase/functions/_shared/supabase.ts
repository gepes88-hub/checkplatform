import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { HttpError } from './http.ts';

const URL = Deno.env.get('SUPABASE_URL')!;
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

/** service_role 클라이언트: RLS를 우회하므로 반드시 권한 확인 후에만 쓴다 */
export const admin: SupabaseClient = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });

export interface Caller { userId: string; isHcg: boolean; client: SupabaseClient }

/** Verify JWT 를 끈 함수라서 여기서 로그인 사용자를 직접 확인한다 */
export async function getCaller(req: Request): Promise<Caller> {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token || token === ANON) throw new HttpError(401, 'UNAUTHENTICATED', '로그인이 필요합니다');
  const client = createClient(URL, ANON, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, 'UNAUTHENTICATED', '로그인이 필요합니다');
  const { data: p } = await admin.from('profiles').select('is_hcg').eq('id', data.user.id).maybeSingle();
  return { userId: data.user.id, isHcg: Boolean(p?.is_hcg), client };
}

/** 진단 접근 권한 (고객사 구성원 또는 HCG) */
export async function assertDiag(caller: Caller, diagnosisId: string) {
  if (caller.isHcg) return;
  const { data: d } = await admin.from('diagnoses').select('org_id').eq('id', diagnosisId).maybeSingle();
  if (!d) throw new HttpError(404, 'NOT_FOUND', '진단을 찾을 수 없습니다');
  const { data: m } = await admin.from('org_members').select('user_id').eq('org_id', d.org_id).eq('user_id', caller.userId).maybeSingle();
  if (!m) throw new HttpError(403, 'forbidden', '권한이 없습니다');
}

export function assertHcg(caller: Caller) {
  if (!caller.isHcg) throw new HttpError(403, 'forbidden', 'HCG 컨설턴트만 할 수 있습니다');
}

export async function ledger(diagnosisId: string | null, feature: string, r: { model: string; inputTokens: number; outputTokens: number; costUsd: number }) {
  await admin.from('ai_ledger').insert({ diagnosis_id: diagnosisId, feature, model: r.model, input_tokens: r.inputTokens, output_tokens: r.outputTokens, cost_usd: r.costUsd });
}
