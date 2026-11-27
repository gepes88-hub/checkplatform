import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Check, ClipboardCheck, Stethoscope } from 'lucide-react';
import { supabase, q } from '../lib/supabase';
import { cx } from '../lib/format';
import type { Module, Org } from '../lib/types';
import { AppShell } from '../components/AppShell';
import { Button, Card, ErrorBox, Field, PageHeader, inputCls } from '../components/ui';

const INDUSTRIES = ['제조', 'IT·소프트웨어', '유통·소비재', '제약·바이오', '금융', '건설·부동산', '미디어·엔터', '서비스', '공공·기타'];

export default function NewDiagnosis() {
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const [kind, setKind] = useState<'health' | 'module'>(sp.get('kind') === 'module' ? 'module' : 'health');
  const [mods, setMods] = useState<string[]>(['m1']);
  const [orgId, setOrgId] = useState<string>('');
  const [orgName, setOrgName] = useState('');
  const [industry, setIndustry] = useState(INDUSTRIES[0]);
  const [emp, setEmp] = useState<number | ''>('');
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);

  const modules = useQuery({ queryKey: ['modules'], queryFn: () => q<Module[]>(supabase.from('modules').select('*').order('sort')) });
  const orgs = useQuery({ queryKey: ['my-orgs'], queryFn: () => q<Org[]>(supabase.from('orgs').select('id, name, industry, employee_count').order('created_at')) });

  const submit = async () => {
    setBusy(true); setErr(null);
    try {
      const id = await q<string>(supabase.rpc('create_diagnosis', {
        p_org_name: orgName.trim(), p_industry: industry, p_employees: emp === '' ? null : emp,
        p_kind: kind, p_modules: kind === 'module' ? mods : [],
        p_title: title.trim() || (kind === 'health' ? `${new Date().getFullYear()} HR 헬스체크` : `${new Date().getFullYear()} 평가·성과관리 진단`),
        p_org_id: orgId || null,
      }));
      nav(`/room/${id}`);
    } catch (e) { setErr(e); } finally { setBusy(false); }
  };

  const canSubmit = (orgId || orgName.trim()) && (kind === 'health' || mods.length > 0);

  return (
    <AppShell>
      <PageHeader title="새 진단" sub="진단을 만들면 이 진단만을 위한 보안 공간이 열립니다." />
      <div className="grid lg:grid-cols-[1fr_20rem] gap-6">
        <div className="space-y-5">
          <Card className="p-5">
            <div className="font-semibold mb-3">1. 진단 방식</div>
            <div className="grid sm:grid-cols-2 gap-3">
              {([['health', 'HR 헬스체크', '인사제도 전 영역(14개)을 넓게. 결과에서 깊게 볼 모듈을 추천합니다.', <Stethoscope size={18} />],
                ['module', '모듈 딥진단', '고민이 분명한 영역을 골라 깊게. 몰입·재직의도 핵심 문항은 함께 봅니다.', <ClipboardCheck size={18} />]] as const).map(([k, t, s, icon]) => (
                <button key={k} onClick={() => setKind(k)} className={cx('text-left rounded-xl border p-4', kind === k ? 'border-indigo-500 bg-indigo-50/50 ring-1 ring-indigo-500' : 'border-slate-200 hover:border-slate-300')}>
                  <div className="flex items-center gap-2 font-semibold text-sm">{icon}{t}</div>
                  <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">{s}</p>
                </button>
              ))}
            </div>
            {kind === 'module' && (
              <div className="mt-4 grid sm:grid-cols-2 gap-2">
                {(modules.data ?? []).map((m) => {
                  const on = mods.includes(m.id);
                  return (
                    <button key={m.id} disabled={!m.ready}
                      onClick={() => setMods(on ? mods.filter((x) => x !== m.id) : [...mods, m.id])}
                      className={cx('text-left rounded-lg border px-3 py-2.5 text-sm flex gap-2.5', !m.ready ? 'opacity-50 cursor-not-allowed border-slate-200' : on ? 'border-indigo-500 bg-indigo-50/50' : 'border-slate-200 hover:border-slate-300')}>
                      <span className={cx('mt-0.5 w-4 h-4 rounded border flex items-center justify-center shrink-0', on ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-slate-300')}>{on && <Check size={12} strokeWidth={3} />}</span>
                      <span><span className="font-semibold">{m.name}</span>{!m.ready && <span className="text-xs text-slate-400 ml-1.5">준비 중</span>}<span className="block text-xs text-slate-500 mt-0.5">{m.summary}</span></span>
                    </button>
                  );
                })}
              </div>
            )}
          </Card>

          <Card className="p-5 space-y-4">
            <div className="font-semibold">2. 회사</div>
            {(orgs.data ?? []).length > 0 && (
              <Field label="기존 회사로 진행">
                <select className={inputCls} value={orgId} onChange={(e) => setOrgId(e.target.value)}>
                  <option value="">새 회사 등록</option>
                  {orgs.data!.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
              </Field>
            )}
            {!orgId && (
              <div className="grid sm:grid-cols-3 gap-3">
                <Field label="회사명"><input className={inputCls} value={orgName} onChange={(e) => setOrgName(e.target.value)} placeholder="(주)○○○" /></Field>
                <Field label="업종"><select className={inputCls} value={industry} onChange={(e) => setIndustry(e.target.value)}>{INDUSTRIES.map((i) => <option key={i}>{i}</option>)}</select></Field>
                <Field label="직원 수"><input className={inputCls} type="number" min={1} value={emp} onChange={(e) => setEmp(e.target.value ? Number(e.target.value) : '')} placeholder="예: 250" /></Field>
              </div>
            )}
            <Field label="진단 이름" hint="비워 두면 자동"><input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={kind === 'health' ? '2026 HR 헬스체크' : '2026 평가·성과관리 진단'} /></Field>
          </Card>
          <ErrorBox error={err} />
          <Button onClick={submit} loading={busy} disabled={!canSubmit}>보안 공간 만들고 들어가기</Button>
        </div>

        <Card className="p-5 h-fit text-sm">
          <div className="font-semibold">진행 순서 (약 2주)</div>
          <ol className="mt-3 space-y-3 text-slate-600">
            <li><b className="text-slate-900">① 설계</b> — 조직 구분과 문항을 확인합니다.</li>
            <li><b className="text-slate-900">② 수집</b> — 직원 설문 링크 배포, 임원·조직장 AI 인터뷰, 인사 규정 업로드.</li>
            <li><b className="text-slate-900">③ 분석</b> — 영역별 수준, 영향도(IPA), 직원 유형, 제도 성숙도.</li>
            <li><b className="text-slate-900">④ 리포트</b> — HCG 컨설턴트 검수 후 발행됩니다.</li>
          </ol>
        </Card>
      </div>
    </AppShell>
  );
}
