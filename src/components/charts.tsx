import { cx } from '../lib/format';

/** 긍정률 색: 낮음(빨강) ~ 높음(인디고). HCG 보고서 관례: 부정 우세 구간을 붉게 */
export function posTone(p: number | null | undefined) {
  if (p == null) return 'bg-slate-100 text-slate-400';
  if (p < 30) return 'bg-rose-100 text-rose-800';
  if (p < 45) return 'bg-amber-50 text-amber-800';
  if (p < 60) return 'bg-slate-100 text-slate-700';
  if (p < 75) return 'bg-indigo-50 text-indigo-800';
  return 'bg-indigo-100 text-indigo-900';
}
export function meanTone(m: number | null | undefined) {
  if (m == null) return 'bg-slate-50 text-slate-300';
  if (m < 2.5) return 'bg-rose-100 text-rose-800';
  if (m < 3.0) return 'bg-amber-50 text-amber-800';
  if (m < 3.5) return 'bg-slate-50 text-slate-700';
  if (m < 4.0) return 'bg-indigo-50 text-indigo-800';
  return 'bg-indigo-100 text-indigo-900';
}

/** 가로 막대 (영역별 긍정률 등) */
export function HBars({ rows, max = 100, unit = '%', avgLine }: { rows: { label: string; value: number | null; note?: string; tone?: string }[]; max?: number; unit?: string; avgLine?: number }) {
  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <div key={r.label} className="grid grid-cols-[7.5rem_1fr_3.5rem] items-center gap-3 text-sm">
          <div className="truncate text-slate-600" title={r.label}>{r.label}</div>
          <div className="relative h-5 rounded bg-slate-100 overflow-hidden">
            <div className={cx('h-full rounded', r.tone ?? (r.value != null && r.value < 45 ? 'bg-rose-400' : 'bg-indigo-500'))} style={{ width: `${Math.max(0, Math.min(100, ((r.value ?? 0) / max) * 100))}%` }} />
            {avgLine != null && <div className="absolute top-0 bottom-0 w-px bg-slate-900/50" style={{ left: `${(avgLine / max) * 100}%` }} />}
          </div>
          <div className="text-right num font-semibold">{r.value == null ? '-' : `${Math.round(r.value * 10) / 10}${unit}`}</div>
        </div>
      ))}
    </div>
  );
}

/** IPA 산점도: x=수행(평균), y=중요도(결과와의 상관) */
export function IpaChart({ points }: { points: { name: string; importance: number; performance: number; quadrant: string }[] }) {
  if (!points.length) return <div className="text-sm text-slate-400 py-8 text-center">응답이 10건 이상이어야 영향도를 계산할 수 있습니다.</div>;
  const W = 560, H = 360, P = 44;
  const xs = points.map((p) => p.performance), ys = points.map((p) => p.importance);
  const padX = Math.max(0.12, (Math.max(...xs) - Math.min(...xs)) * 0.2), padY = Math.max(0.05, (Math.max(...ys) - Math.min(...ys)) * 0.2);
  const xMin = Math.min(...xs) - padX, xMax = Math.max(...xs) + padX * 2.2; // 오른쪽은 라벨 자리
  const yMin = Math.min(...ys) - padY, yMax = Math.max(...ys) + padY;
  const sx = (v: number) => P + ((v - xMin) / (xMax - xMin)) * (W - P * 2);
  const sy = (v: number) => H - P - ((v - yMin) / (yMax - yMin)) * (H - P * 2);
  const ax = xs.reduce((a, b) => a + b, 0) / xs.length, ay = ys.reduce((a, b) => a + b, 0) / ys.length;
  const color: Record<string, string> = { '중점 개선': '#e11d48', '강점 유지': '#4f46e5', '장기 개선': '#d97706', '현상 유지': '#64748b' };
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
      <rect x={P} y={P} width={sx(ax) - P} height={sy(ay) - P} fill="#fff1f2" />
      <line x1={sx(ax)} x2={sx(ax)} y1={P} y2={H - P} stroke="#cbd5e1" strokeDasharray="4 4" />
      <line x1={P} x2={W - P} y1={sy(ay)} y2={sy(ay)} stroke="#cbd5e1" strokeDasharray="4 4" />
      <line x1={P} x2={W - P} y1={H - P} y2={H - P} stroke="#94a3b8" />
      <line x1={P} x2={P} y1={P} y2={H - P} stroke="#94a3b8" />
      <text x={W / 2} y={H - 10} textAnchor="middle" fontSize="11" fill="#64748b">현재 수준(평균) →</text>
      <text x={14} y={H / 2} textAnchor="middle" fontSize="11" fill="#64748b" transform={`rotate(-90 14 ${H / 2})`}>몰입·만족에 대한 영향도 →</text>
      <text x={P + 6} y={P + 14} fontSize="11" fill="#e11d48" fontWeight="700">중점 개선</text>
      <text x={W - P - 6} y={P + 14} fontSize="11" fill="#4f46e5" fontWeight="700" textAnchor="end">강점 유지</text>
      <text x={P + 6} y={H - P - 8} fontSize="11" fill="#d97706" fontWeight="700">장기 개선</text>
      {placeLabels(points.map((p) => ({ name: p.name, x: sx(p.performance), y: sy(p.importance), q: p.quadrant }))).map((p) => (
        <g key={p.name}>
          <circle cx={p.x} cy={p.y} r="5.5" fill={color[p.q] ?? '#64748b'} />
          {Math.abs(p.ly - p.y) > 2 && <line x1={p.x + 5} y1={p.y} x2={p.x + 10} y2={p.ly - 4} stroke="#cbd5e1" />}
          <text x={p.x + 11} y={p.ly} fontSize="11.5" fill="#0f172a">{p.name}</text>
        </g>
      ))}
    </svg>
  );
}

/** 점 라벨이 겹치지 않게 아래로 밀어낸다 */
function placeLabels(pts: { name: string; x: number; y: number; q: string }[]) {
  const placed: { name: string; x: number; y: number; q: string; ly: number }[] = [];
  for (const p of [...pts].sort((a, b) => a.y - b.y)) {
    let ly = p.y + 4;
    const w = p.name.length * 11.5 + 12;
    for (let guard = 0; guard < 40; guard++) {
      const hit = placed.find((o) => Math.abs(o.ly - ly) < 14 && p.x < o.x + o.name.length * 11.5 + 12 && o.x < p.x + w);
      if (!hit) break;
      ly = hit.ly + 14;
    }
    placed.push({ ...p, ly });
  }
  return placed;
}

/** 직원 유형 4분면 */
export function TypeQuadrant({ pct, n }: { pct: { effective: number; frustrated: number; detached: number; ineffective: number }; n: number }) {
  const cell = (label: string, sub: string, v: number, tone: string) => (
    <div className={cx('rounded-xl p-3', tone)}>
      <div className="text-xs font-semibold">{label}</div>
      <div className="text-2xl font-bold num mt-1">{Math.round(v)}%</div>
      <div className="text-[11px] mt-1 opacity-80 leading-snug">{sub}</div>
    </div>
  );
  return (
    <div>
      <div className="text-[11px] text-slate-400 mb-1.5">↑ 몰입·만족 높음</div>
      <div className="grid grid-cols-2 gap-2 items-stretch">
        {cell('Frustrated · 좌절', '몰입은 높으나 일할 환경·지원이 부족 → 이탈 위험', pct.frustrated, 'bg-amber-50 text-amber-900')}
        {cell('Effective · 효과적', '좋은 환경에서 몰입', pct.effective, 'bg-indigo-50 text-indigo-900')}
        {cell('Ineffective · 비효과적', '환경도 몰입도 낮음', pct.ineffective, 'bg-rose-50 text-rose-900')}
        {cell('Detached · 분리', '지원은 있으나 애착·몰입이 낮음', pct.detached, 'bg-slate-100 text-slate-800')}
      </div>
      <div className="flex justify-between text-[11px] text-slate-400 mt-1.5"><span>지원 환경 낮음</span><span>지원 환경 높음 →</span></div>
      <div className="text-[11px] text-slate-400 mt-1">유효 응답 {n}명 · 지원 환경(투입·과정 영역)과 몰입·만족·재직의도 각각 평균 3점 기준</div>
    </div>
  );
}

/** Maturity 막대: 1~4 */
export function MaturityBar({ level }: { level: number | null }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 grid grid-cols-4 gap-0.5">
        {[1, 2, 3, 4].map((l) => (
          <div key={l} className={cx('h-2 rounded-sm', level != null && level >= l ? 'bg-indigo-500' : level != null && level >= l - 0.5 ? 'bg-indigo-300' : 'bg-slate-200')} />
        ))}
      </div>
      <span className="text-xs num w-8 text-right font-semibold">{level == null ? '-' : level.toFixed(1)}</span>
    </div>
  );
}
