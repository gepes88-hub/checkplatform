// AWS Secrets Manager 에서 Claude API 키를 읽는다 (회사 방침: 키를 직접 공유하지 않고 Secrets Manager 로만 조회)
//   필요한 Supabase Edge Function Secrets
//     AWS_ACCESS_KEY_ID · AWS_SECRET_ACCESS_KEY   받은 액세스 키 / 시크릿 키
//     AWS_REGION                                    예: ap-northeast-2
//     AWS_SECRET_ID                                 시크릿 이름 또는 ARN
//     (선택) AWS_SESSION_TOKEN                      임시 자격 증명일 때만
//     (선택) AWS_SECRET_JSON_KEY                    시크릿 값이 JSON 이면 키를 담은 필드명 (없으면 자동으로 찾음)
//   SDK 없이 SigV4 서명을 직접 만든다 (콜드 스타트를 가볍게). 읽은 키는 함수 인스턴스 메모리에 10분 캐시.
import { HttpError } from './http.ts';

const enc = new TextEncoder();
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
const sha256 = async (s: string) => hex(await crypto.subtle.digest('SHA-256', enc.encode(s)));
async function hmac(key: ArrayBuffer | Uint8Array, msg: string): Promise<ArrayBuffer> {
  const k = await crypto.subtle.importKey('raw', key as BufferSource, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return crypto.subtle.sign('HMAC', k, enc.encode(msg));
}

/** AWS SigV4 서명 헤더 (POST · JSON 1.1 프로토콜). now 는 테스트용 */
export async function signAws(p: {
  service: string; region: string; host: string; target: string; body: string;
  accessKeyId: string; secretAccessKey: string; sessionToken?: string; now?: Date;
}): Promise<Record<string, string>> {
  const t = p.now ?? new Date();
  const amzDate = t.toISOString().replace(/[:-]|\.\d{3}/g, ''); // 20261127T010203Z
  const day = amzDate.slice(0, 8);
  const headers: Record<string, string> = {
    'content-type': 'application/x-amz-json-1.1',
    host: p.host,
    'x-amz-date': amzDate,
    'x-amz-target': p.target,
    ...(p.sessionToken ? { 'x-amz-security-token': p.sessionToken } : {}),
  };
  const names = Object.keys(headers).sort();
  const canonical = ['POST', '/', '', names.map((n) => `${n}:${headers[n].trim()}\n`).join(''), names.join(';'), await sha256(p.body)].join('\n');
  const scope = `${day}/${p.region}/${p.service}/aws4_request`;
  const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, await sha256(canonical)].join('\n');
  let k = await hmac(enc.encode(`AWS4${p.secretAccessKey}`), day);
  k = await hmac(k, p.region);
  k = await hmac(k, p.service);
  k = await hmac(k, 'aws4_request');
  const signature = hex(await hmac(k, toSign));
  return { ...headers, authorization: `AWS4-HMAC-SHA256 Credential=${p.accessKeyId}/${scope}, SignedHeaders=${names.join(';')}, Signature=${signature}` };
}

let cache: { key: string; at: number } | null = null;
const TTL = 10 * 60 * 1000;

/** Claude API 키: ANTHROPIC_API_KEY 가 있으면 그것을(로컬 개발용), 없으면 Secrets Manager 에서 */
export async function anthropicKey(): Promise<string> {
  const direct = Deno.env.get('ANTHROPIC_API_KEY');
  if (direct) return direct;
  if (cache && Date.now() - cache.at < TTL) return cache.key;

  const accessKeyId = Deno.env.get('AWS_ACCESS_KEY_ID');
  const secretAccessKey = Deno.env.get('AWS_SECRET_ACCESS_KEY');
  const region = Deno.env.get('AWS_REGION') ?? 'ap-northeast-2';
  const secretId = Deno.env.get('AWS_SECRET_ID');
  if (!accessKeyId || !secretAccessKey || !secretId) {
    throw new HttpError(500, 'AI_NOT_CONFIGURED', 'AWS 자격 증명(AWS_ACCESS_KEY_ID · AWS_SECRET_ACCESS_KEY · AWS_SECRET_ID)이 설정되지 않았습니다');
  }
  const host = `secretsmanager.${region}.amazonaws.com`;
  const body = JSON.stringify({ SecretId: secretId });
  const headers = await signAws({
    service: 'secretsmanager', region, host, target: 'secretsmanager.GetSecretValue', body,
    accessKeyId, secretAccessKey, sessionToken: Deno.env.get('AWS_SESSION_TOKEN') ?? undefined,
  });
  const res = await fetch(`https://${host}/`, { method: 'POST', headers, body });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) {
    // 키 값이 응답에 섞일 일은 없지만, 오류 메시지만 짧게 남긴다
    const why = (j as { __type?: string; message?: string; Message?: string });
    throw new HttpError(502, 'AI_KEY_FETCH_FAILED', `Secrets Manager 조회 실패: ${(why.__type ?? res.status).toString().split('#').pop()} ${why.message ?? why.Message ?? ''}`.trim());
  }
  const raw = String((j as { SecretString?: string }).SecretString ?? '').trim();
  const key = pickKey(raw);
  if (!key) throw new HttpError(502, 'AI_KEY_FETCH_FAILED', '시크릿 값에서 Claude API 키를 찾지 못했습니다 (AWS_SECRET_JSON_KEY 로 필드명을 지정해 주세요)');
  cache = { key, at: Date.now() };
  return key;
}

/** 시크릿 값이 문자열 그대로이거나 JSON({"ANTHROPIC_API_KEY":"sk-ant-..."}) 인 경우 모두 처리 */
export function pickKey(raw: string): string | null {
  if (!raw) return null;
  if (!raw.startsWith('{')) return raw;
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    const field = Deno.env.get('AWS_SECRET_JSON_KEY');
    if (field && typeof o[field] === 'string') return o[field] as string;
    for (const f of ['ANTHROPIC_API_KEY', 'anthropic_api_key', 'CLAUDE_API_KEY', 'claude_api_key', 'api_key', 'apiKey', 'key']) {
      if (typeof o[f] === 'string') return o[f] as string;
    }
    const v = Object.values(o).find((x) => typeof x === 'string' && (x as string).startsWith('sk-ant'));
    return (v as string) ?? null;
  } catch {
    return null;
  }
}
