export type DiagStatus = 'setup' | 'collecting' | 'analyzing' | 'review' | 'published' | 'closed';
export type Track = 'exec' | 'leader' | 'staff';

export interface Profile { id: string; email: string | null; full_name: string | null; is_hcg: boolean }
export interface Org { id: string; name: string; industry: string | null; employee_count: number | null }
export interface Segments { unit: { name: string; headcount?: number }[]; level: string[]; role: string[]; tenure: string[]; age: string[] }
export interface Diagnosis {
  id: string; org_id: string; code: string; kind: 'health' | 'module'; modules: string[]; title: string; status: DiagStatus;
  settings: { segments?: Segments; intro?: string }; survey_token: string; survey_open: boolean; due_date: string | null; created_at: string;
  orgs?: Org;
}
export interface Domain { id: string; layer: string; module: string; name: string; key_question: string | null; sort: number }
export interface Item { id: string; domain_id: string; sub: string | null; text: string; kind: 'likert' | 'choice' | 'multi' | 'text'; options: string[] | null; max_pick: number | null; reverse: boolean; is_short: boolean; source: string | null; diagnosis_id: string | null; sort: number }
export interface Module { id: string; name: string; summary: string | null; ready: boolean; sort: number }
export interface Invite { id: string; diagnosis_id: string; track: Track; label: string; token: string; status: 'invited' | 'started' | 'done'; summary: InterviewSummary | null; created_at: string; finished_at: string | null }
export interface InterviewSummary { key_points: { domain: string; point: string; quote?: string; tone?: string }[]; themes: string[]; one_line: string }
export interface Doc { id: string; diagnosis_id: string; name: string; path: string; mime: string | null; status: 'uploaded' | 'extracting' | 'done' | 'failed'; extracted: DocExtract | null; error: string | null; created_at: string }
export interface DocExtract { doc_type?: string; summary?: string; structure?: { item: string; value: string }[]; maturity?: { area: string; element: string; level: number; evidence: string }[]; checkpoints?: { id: string; status: 'ok' | 'gap'; note: string }[]; risks?: string[] }
export interface MaturityArea { id: string; name: string; elements: string[]; levels: Record<string, string>; sort: number }
export interface MaturityScore { diagnosis_id: string; area_id: string; element: string; level: number; evidence: string | null; source: string | null }
export interface Checkpoint { id: string; module: string; area: string; text: string; why: string | null }

export interface Analysis {
  computed_at: string;
  counts: { total: number; valid: number; excluded: number; headcount: number | null; rate: number | null; by_unit: { unit: string; n: number; headcount: number | null; rate: number | null }[] };
  index: { driver: number | null; outcome: number | null };
  domains: { id: string; name: string; layer: string; module: string; mean: number | null; pos: number | null; items: number }[];
  items: { id: string; domain_id: string; sub: string | null; text: string; n: number; mean: number | null; pos: number | null; neg: number | null }[];
  hr_sub: { sub: string; mean: number; pos: number }[];
  culture_type: { type: string; mean: number | null; pos: number | null }[];
  ipa: { id: string; name: string; importance: number; performance: number; quadrant: string }[];
  types: { n: number; pct: { effective: number; frustrated: number; detached: number; ineffective: number } };
  heat: Record<string, { value: string; n: number; hidden: boolean; domains: Record<string, number | null>; outcome: number | null }[]>;
  top5: Analysis['items']; bottom5: Analysis['items'];
  choices: { id: string; domain_id: string; text: string; n: number; ranks: { label: string; count: number; pct: number }[] }[];
  texts: { id: string; text: string; count: number }[];
}

export interface ReportIssue { title: string; domain_id: string; finding: string; evidence?: { source: string; text: string }[]; certainty: string; severity: number; impact: number; library_id?: string | null }
export interface ReportSections {
  headline?: string;
  summary?: { title: string; body: string }[];
  key_issues?: ReportIssue[];
  issues?: ReportIssue[];
  root_cause?: { core: string; chains: { cause: string; leads_to: string[] }[] };
  say_do?: { topic: string; say: string; do: string; gap: string }[];
  domain_notes?: Record<string, string>;
  directions?: { title: string; why: string; tasks: { title: string; desc: string; importance: number; urgency: number; quick_win: boolean }[] }[];
  recommended_modules?: { module_id: string; reason: string }[];
  design_questions?: string[];
  interview_digest?: { track: string; points: string[] }[];
  text_digest?: { item_id: string; themes: { theme: string; weight: string; quote: string }[] }[];
  caveats?: string[];
}
export interface Report { diagnosis_id: string; sections: ReportSections; status: 'draft' | 'published'; generated_at: string; published_at: string | null }

export const STATUS_LABEL: Record<DiagStatus, string> = { setup: '설계', collecting: '수집 중', analyzing: '분석', review: 'HCG 검수', published: '발행 완료', closed: '종료' };
export const TRACK_LABEL: Record<Track, string> = { exec: '임원', leader: '조직장', staff: '구성원' };
export const DIM_LABEL: Record<string, string> = { unit: '조직', level: '직급', role: '직책', tenure: '근속', age: '연령' };
