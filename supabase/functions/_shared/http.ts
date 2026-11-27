// 공통 HTTP 유틸: CORS, JSON 응답, 오류 코드
const ORIGINS = (Deno.env.get('APP_ORIGIN') ?? '*').split(',').map((x) => x.trim().replace(/\/$/, '')).filter(Boolean);

function allowOrigin(origin: string | null): string {
  if (!ORIGINS.length || ORIGINS.includes('*')) return '*';
  if (origin && ORIGINS.includes(origin.replace(/\/$/, ''))) return origin;
  return ORIGINS[0];
}

export function cors(origin: string | null): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': allowOrigin(origin),
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
}

export class HttpError extends Error {
  constructor(public status: number, public code: string, message?: string) {
    super(message ?? code);
  }
}

export function serve(handler: (req: Request) => Promise<unknown>) {
  Deno.serve(async (req) => {
    const origin = req.headers.get('Origin');
    if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(origin) });
    const send = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), { status, headers: { ...cors(origin), 'Content-Type': 'application/json; charset=utf-8' } });
    try {
      return send(await handler(req));
    } catch (e) {
      if (e instanceof HttpError) return send({ error: e.code, message: e.message }, e.status);
      const msg = e instanceof Error ? e.message : String(e);
      if (/forbidden/.test(msg)) return send({ error: 'forbidden', message: '권한이 없습니다' }, 403);
      console.error(e);
      return send({ error: 'INTERNAL', message: msg }, 500);
    }
  });
}

export async function readJson<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new HttpError(400, 'BAD_JSON');
  }
}
