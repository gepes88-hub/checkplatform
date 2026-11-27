// 설문 통계 엔진 — 숫자는 여기서만 만든다 (AI는 해석만).
// HCG 분석 방법: 긍정응답률(4·5점), 무성의 응답 제외, 인구통계 Heatmap(5명 미만 숨김),
// Top/Bottom 5, IPA(중요도=결과변수와의 상관), 직원 유형 4분면(지원환경×몰입), 선택형 빈도.
// Deno 전용 API를 쓰지 않는다 (node 에서도 테스트 가능).

export interface StatItem { id: string; domain_id: string; kind: 'likert' | 'choice' | 'multi' | 'text'; reverse: boolean; sub: string | null; text: string; options: string[] | null }
export interface StatDomain { id: string; layer: string; module: string; name: string }
export interface StatResponse { id: string; demo: Record<string, string>; answers: Record<string, unknown> }
export interface Segments { unit?: { name: string; headcount?: number }[]; [dim: string]: unknown }

export const MIN_CELL = 5;          // 이보다 적으면 그룹 결과를 숨긴다
const DIMS = ['unit', 'level', 'role', 'tenure', 'age'] as const;
export const DIM_LABEL: Record<string, string> = { unit: '조직', level: '직급', role: '직책', tenure: '근속', age: '연령' };

const r2 = (x: number) => Math.round(x * 100) / 100;
const r1 = (x: number) => Math.round(x * 10) / 10;
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);

function pearson(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n < 10) return NaN;
  const mx = avg(xs), my = avg(ys);
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { const dx = xs[i] - mx, dy = ys[i] - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy; }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : NaN;
}

function likertValue(item: StatItem, v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  if (!Number.isFinite(n) || n < 1 || n > 5) return null;
  return item.reverse ? 6 - n : n;
}

export function analyze(items: StatItem[], domains: StatDomain[], responses: StatResponse[], segments: Segments) {
  const likert = items.filter((i) => i.kind === 'likert');
  const domById = new Map(domains.map((d) => [d.id, d]));

  // 1) 무성의 응답 제외: 리커트 10개 이상 답했는데 모두 같은 값, 또는 리커트 절반 미만 응답
  const valid: StatResponse[] = [];
  const excludedIds: string[] = [];
  for (const r of responses) {
    const vals = likert.map((i) => likertValue({ ...i, reverse: false }, r.answers[i.id])).filter((x): x is number => x != null);
    const straight = vals.length >= 10 && vals.every((v) => v === vals[0]);
    const tooFew = likert.length > 0 && vals.length < likert.length / 2;
    if (straight || tooFew) excludedIds.push(r.id); else valid.push(r);
  }

  // 2) 문항별
  const itemStats = likert.map((i) => {
    const vals = valid.map((r) => likertValue(i, r.answers[i.id])).filter((x): x is number => x != null);
    const n = vals.length;
    return {
      id: i.id, domain_id: i.domain_id, sub: i.sub, text: i.text, n,
      mean: n ? r2(avg(vals)) : null,
      pos: n ? r1((vals.filter((v) => v >= 4).length / n) * 100) : null,
      neg: n ? r1((vals.filter((v) => v <= 2).length / n) * 100) : null,
    };
  });

  // 3) 응답자별 영역 점수
  const domItems = new Map<string, StatItem[]>();
  for (const i of likert) { const a = domItems.get(i.domain_id) ?? []; a.push(i); domItems.set(i.domain_id, a); }
  const personDom = valid.map((r) => {
    const out: Record<string, number> = {};
    for (const [d, its] of domItems) {
      const v = its.map((i) => likertValue(i, r.answers[i.id])).filter((x): x is number => x != null);
      if (v.length) out[d] = avg(v);
    }
    return out;
  });
  const layerOf = (d: string) => domById.get(d)?.layer ?? 'module';
  const driverDoms = [...domItems.keys()].filter((d) => ['input', 'throughput'].includes(layerOf(d)));
  const outcomeDoms = [...domItems.keys()].filter((d) => layerOf(d) === 'outcome');
  const personDriver = personDom.map((p) => avg(driverDoms.map((d) => p[d]).filter((x) => x != null && !Number.isNaN(x))));
  const personOutcome = personDom.map((p) => avg(outcomeDoms.map((d) => p[d]).filter((x) => x != null && !Number.isNaN(x))));

  // 4) 영역별
  const domainStats = [...domItems.keys()].map((d) => {
    const its = itemStats.filter((s) => s.domain_id === d && s.mean != null);
    return {
      id: d, name: domById.get(d)?.name ?? d, layer: layerOf(d), module: domById.get(d)?.module ?? 'core',
      mean: its.length ? r2(avg(its.map((s) => s.mean!))) : null,
      pos: its.length ? r1(avg(its.map((s) => s.pos!))) : null,
      items: its.length,
    };
  }).sort((a, b) => (domains.findIndex((x) => x.id === a.id) - domains.findIndex((x) => x.id === b.id)));

  // 5) IPA: 중요도 = 영역 점수와 결과(몰입·만족·재직) 점수의 상관, 수행 = 영역 평균
  const ipa = driverDoms.map((d) => {
    const pairs = personDom.map((p, k) => [p[d], personOutcome[k]] as const).filter(([x, y]) => x != null && !Number.isNaN(x) && !Number.isNaN(y));
    const corr = pearson(pairs.map((p) => p[0]), pairs.map((p) => p[1]));
    const ds = domainStats.find((s) => s.id === d);
    return { id: d, name: ds?.name ?? d, importance: Number.isNaN(corr) ? null : r2(corr), performance: ds?.mean ?? null };
  }).filter((x) => x.importance != null && x.performance != null);
  const impAvg = avg(ipa.map((x) => x.importance!)), perfAvg = avg(ipa.map((x) => x.performance!));
  const ipaOut = ipa.map((x) => ({
    ...x,
    quadrant: x.importance! >= impAvg ? (x.performance! < perfAvg ? '중점 개선' : '강점 유지') : (x.performance! < perfAvg ? '장기 개선' : '현상 유지'),
  }));

  // 6) 직원 유형 4분면 (지원환경 Driver × 몰입 Outcome, 3점 기준) — Effective / Frustrated / Detached / Ineffective
  const types = { effective: 0, frustrated: 0, detached: 0, ineffective: 0 };
  let typed = 0;
  personDriver.forEach((dv, k) => {
    const oc = personOutcome[k];
    if (Number.isNaN(dv) || Number.isNaN(oc)) return;
    typed++;
    if (dv >= 3 && oc >= 3) types.effective++;
    else if (dv < 3 && oc >= 3) types.frustrated++;
    else if (dv >= 3 && oc < 3) types.detached++;
    else types.ineffective++;
  });
  const typePct = Object.fromEntries(Object.entries(types).map(([k, v]) => [k, typed ? r1((v / typed) * 100) : 0]));

  // 7) Heatmap: 인구통계별 영역 평균 (5명 미만 숨김)
  const heat: Record<string, { value: string; n: number; hidden: boolean; domains: Record<string, number | null>; outcome: number | null }[]> = {};
  for (const dim of DIMS) {
    const groups = new Map<string, number[]>();
    valid.forEach((r, k) => { const v = r.demo?.[dim]; if (v) { const a = groups.get(v) ?? []; a.push(k); groups.set(v, a); } });
    if (!groups.size) continue;
    heat[dim] = [...groups.entries()].map(([value, idx]) => {
      const hidden = idx.length < MIN_CELL;
      const doms: Record<string, number | null> = {};
      for (const d of domItems.keys()) {
        const xs = idx.map((k) => personDom[k][d]).filter((x) => x != null && !Number.isNaN(x));
        doms[d] = hidden || !xs.length ? null : r2(avg(xs));
      }
      const oc = idx.map((k) => personOutcome[k]).filter((x) => !Number.isNaN(x));
      return { value, n: idx.length, hidden, domains: doms, outcome: hidden || !oc.length ? null : r2(avg(oc)) };
    });
  }

  // 8) Top / Bottom 5 (긍정률)
  const ranked = itemStats.filter((s) => s.pos != null && layerOf(s.domain_id) !== 'outcome').sort((a, b) => b.pos! - a.pos!);
  const top5 = ranked.slice(0, 5);
  const bottom5 = ranked.slice(-5).reverse();

  // 9) 선택형
  const choices = items.filter((i) => i.kind === 'choice' || i.kind === 'multi').map((i) => {
    const counts: Record<string, number> = {};
    let n = 0;
    for (const r of valid) {
      const v = r.answers[i.id];
      const arr = [...new Set((Array.isArray(v) ? v : v != null && v !== '' ? [v] : []).map(String))];
      if (arr.length) n++;
      for (const x of arr) counts[String(x)] = (counts[String(x)] ?? 0) + 1;
    }
    const ranks = Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([label, count]) => ({ label, count, pct: n ? r1((count / n) * 100) : 0 }));
    return { id: i.id, domain_id: i.domain_id, text: i.text, n, ranks };
  });

  // 10) 주관식 (원문은 AI 요약에만 쓰고 리포트에는 요약·익명 인용만)
  const texts = items.filter((i) => i.kind === 'text').map((i) => ({
    id: i.id, text: i.text,
    answers: valid.map((r) => String(r.answers[i.id] ?? '').trim()).filter((s) => s.length >= 2).map((s) => s.slice(0, 400)),
  }));

  // 11) 응답률
  const units = (segments.unit ?? []) as { name: string; headcount?: number }[];
  const headTotal = units.reduce((a, u) => a + (u.headcount ?? 0), 0);
  const byUnit = units.map((u) => {
    const n = valid.filter((r) => r.demo?.unit === u.name).length;
    return { unit: u.name, n, headcount: u.headcount ?? null, rate: u.headcount ? r1((n / u.headcount) * 100) : null };
  });

  // 12) 인사제도 하위 영역, 조직문화 유형
  const hrSub = groupBy(itemStats.filter((s) => s.domain_id === 'hr' && s.sub), (s) => s.sub!);
  const cultureType = itemStats.filter((s) => s.domain_id === 'culture' && s.sub?.startsWith('유형:')).map((s) => ({ type: s.sub!.slice(3), mean: s.mean, pos: s.pos }));

  const overallDriver = avg(personDriver.filter((x) => !Number.isNaN(x)));
  const overallOutcome = avg(personOutcome.filter((x) => !Number.isNaN(x)));

  return {
    computed_at: new Date().toISOString(),
    counts: { total: responses.length, valid: valid.length, excluded: excludedIds.length, headcount: headTotal || null, rate: headTotal ? r1((valid.length / headTotal) * 100) : null, by_unit: byUnit },
    index: { driver: Number.isNaN(overallDriver) ? null : r2(overallDriver), outcome: Number.isNaN(overallOutcome) ? null : r2(overallOutcome) },
    domains: domainStats,
    items: itemStats,
    hr_sub: Object.entries(hrSub).map(([sub, ss]) => ({ sub, mean: r2(avg(ss.map((s) => s.mean ?? NaN).filter((x) => !Number.isNaN(x)))), pos: r1(avg(ss.map((s) => s.pos ?? NaN).filter((x) => !Number.isNaN(x)))) })),
    culture_type: cultureType,
    ipa: ipaOut,
    types: { n: typed, pct: typePct },
    heat,
    top5, bottom5,
    choices,
    texts,
    excluded_ids: excludedIds,
  };
}

function groupBy<T>(xs: T[], key: (x: T) => string): Record<string, T[]> {
  const o: Record<string, T[]> = {};
  for (const x of xs) (o[key(x)] ??= []).push(x);
  return o;
}

export type Analysis = ReturnType<typeof analyze>;
