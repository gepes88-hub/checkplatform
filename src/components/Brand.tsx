import { cx } from '../lib/format';

/** 로고: 사각 블록 안의 체크 표식 + CHECK 워드마크 (가칭) */
export function Mark({ size = 28, dark = false }: { size?: number; dark?: boolean }) {
  return (
    <span className={cx('inline-flex items-center justify-center rounded-lg shrink-0', dark ? 'bg-emerald-400/10 ring-1 ring-emerald-400/40' : 'bg-indigo-600')} style={{ width: size, height: size }}>
      <svg viewBox="0 0 24 24" width={size * 0.62} height={size * 0.62} fill="none" stroke={dark ? '#6EE7B7' : '#fff'} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M4 12.5l5 5L20 6.5" />
      </svg>
    </span>
  );
}

export function Brand({ dark = false, sub = true }: { dark?: boolean; sub?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2">
      <Mark dark={dark} />
      <span className="leading-none">
        <span className={cx('block font-extrabold tracking-[0.14em] text-[15px]', dark ? 'text-white' : 'text-slate-900')}>CHECK</span>
        {sub && <span className={cx('block text-[10px] mt-0.5 tracking-wide', dark ? 'text-slate-400' : 'text-slate-500')}>HCG 조직·인사 진단</span>}
      </span>
    </span>
  );
}
