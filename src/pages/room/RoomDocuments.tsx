import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, FileUp, Loader2, RotateCw } from 'lucide-react';
import { supabase, q, fn } from '../../lib/supabase';
import { cx } from '../../lib/format';
import type { Checkpoint, Doc, MaturityArea, MaturityScore } from '../../lib/types';
import { useRoom, RoomTitle } from '../../components/secure/SecureRoom';
import { Button, Card, CardHead, Empty, ErrorBox, Pill } from '../../components/ui';
import { MaturityBar } from '../../components/charts';

const LV_LABEL: Record<number, string> = { 1: 'Reactive · 대응적', 2: 'Systematic · 체계적', 3: 'Strategic · 전략적', 4: 'Agile · 기민한' };

async function readText(file: File): Promise<string | null> {
  const name = file.name.toLowerCase();
  if (name.endsWith('.txt') || name.endsWith('.md') || name.endsWith('.csv')) return await file.text();
  if (name.endsWith('.docx')) {
    const mammoth = await import('mammoth');
    const r = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    return r.value;
  }
  return null; // PDF 는 서버에서 AI가 직접 읽는다
}

export default function RoomDocuments() {
  const { diag } = useRoom();
  const qc = useQueryClient();
  const inp = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const docs = useQuery({ queryKey: ['docs', diag.id], queryFn: () => q<Doc[]>(supabase.from('documents').select('*').eq('diagnosis_id', diag.id).order('created_at')), refetchInterval: (qq) => ((qq.state.data as Doc[] | undefined)?.some((d) => d.status === 'extracting') ? 4000 : false) });
  const areas = useQuery({ queryKey: ['mat-areas'], queryFn: () => q<MaturityArea[]>(supabase.from('maturity_areas').select('*').order('sort')) });
  const scores = useQuery({ queryKey: ['mat', diag.id], queryFn: () => q<MaturityScore[]>(supabase.from('maturity_scores').select('*').eq('diagnosis_id', diag.id)) });
  const cps = useQuery({ queryKey: ['cps'], queryFn: () => q<Checkpoint[]>(supabase.from('checkpoints').select('*').order('sort')) });
  const cpText = new Map((cps.data ?? []).map((c) => [c.id, c]));

  const refreshAll = () => { qc.invalidateQueries({ queryKey: ['docs', diag.id] }); qc.invalidateQueries({ queryKey: ['mat', diag.id] }); };

  const extract = async (id: string) => {
    try { await fn('doc-extract', { document_id: id }); } catch (e) { setErr(e); }
    refreshAll();
  };

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true); setErr(null);
    try {
      for (const f of Array.from(files)) {
        if (f.size > 20 * 1024 * 1024) throw new Error(`${f.name}: 20MB 이하만 올릴 수 있습니다`);
        const text = await readText(f);
        if (!text && !f.name.toLowerCase().endsWith('.pdf')) throw new Error(`${f.name}: PDF · Word(docx) · 텍스트만 올릴 수 있습니다. HWP는 PDF로 저장해 주세요.`);
        const path = `${diag.id}/${crypto.randomUUID()}-${f.name.replace(/[^\w.가-힣-]/g, '_')}`;
        const up = await supabase.storage.from('diag-docs').upload(path, f, { contentType: f.type || undefined });
        if (up.error) throw up.error;
        const row = await q<Doc>(supabase.from('documents').insert({ diagnosis_id: diag.id, name: f.name, path, mime: f.type, text_content: text }).select().single());
        refreshAll();
        void extract(row.id);
      }
    } catch (e) { setErr(e); } finally { setBusy(false); if (inp.current) inp.current.value = ''; }
  };

  const setLevel = async (area: string, element: string, level: number) => {
    await supabase.from('maturity_scores').upsert({ diagnosis_id: diag.id, area_id: area, element, level, evidence: '담당자 확인', source: 'manual' });
    qc.invalidateQueries({ queryKey: ['mat', diag.id] });
  };

  const scoreOf = (a: string, e: string) => (scores.data ?? []).find((s) => s.area_id === a && s.element === e);

  return (
    <>
      <RoomTitle title="제도 문서" sub="평가·보상·승진 규정, 직급표, 위임전결, 업무분장 등을 올리면 HCG 기준(Check Point · HR Maturity)으로 점검합니다."
        right={<><input ref={inp} type="file" multiple accept=".pdf,.docx,.txt,.md" className="hidden" onChange={(e) => upload(e.target.files)} />
          <Button onClick={() => inp.current?.click()} loading={busy}><FileUp size={15} />문서 올리기</Button></>} />
      <ErrorBox error={err} />
      <div className="grid xl:grid-cols-2 gap-5 mt-3 items-start">
        <Card>
          <CardHead title={`문서 ${docs.data?.length ?? 0}건`} />
          {!docs.data?.length ? <Empty icon={<FileUp size={18} />} title="올린 문서가 없습니다">PDF, Word(docx), 텍스트. 문서는 이 진단 공간 전용 저장소에 암호화 보관됩니다.</Empty> : (
            <ul className="divide-y divide-slate-100">
              {docs.data.map((d) => (
                <li key={d.id} className="px-5 py-4">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm flex-1 truncate">{d.name}</span>
                    {d.status === 'extracting' && <Pill tone="amber"><Loader2 size={11} className="animate-spin" />분석 중</Pill>}
                    {d.status === 'done' && <Pill tone="emerald">점검 완료</Pill>}
                    {d.status === 'failed' && <Pill tone="rose">실패</Pill>}
                    {(d.status === 'failed' || d.status === 'uploaded') && <button className="text-slate-400 hover:text-slate-700" onClick={() => extract(d.id)} title="다시 분석"><RotateCw size={14} /></button>}
                  </div>
                  {d.error && <div className="text-xs text-rose-600 mt-1">{d.error}</div>}
                  {d.extracted && (
                    <div className="mt-2 text-sm space-y-2">
                      <div className="text-xs text-slate-400">{d.extracted.doc_type}</div>
                      <p className="text-slate-700 leading-relaxed">{d.extracted.summary}</p>
                      {!!d.extracted.checkpoints?.length && (
                        <ul className="space-y-1">
                          {d.extracted.checkpoints.map((c) => (
                            <li key={c.id} className="flex gap-2 text-xs">
                              {c.status === 'ok' ? <CheckCircle2 size={14} className="text-emerald-600 shrink-0" /> : <AlertTriangle size={14} className="text-amber-600 shrink-0" />}
                              <span><b>{cpText.get(c.id)?.text ?? c.id}</b><span className="block text-slate-500">{c.note}</span></span>
                            </li>
                          ))}
                        </ul>
                      )}
                      {!!d.extracted.risks?.length && <div className="text-xs rounded-lg bg-rose-50 text-rose-800 px-3 py-2">리스크: {d.extracted.risks.join(' · ')}</div>}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHead title="HR Maturity Level" right={<span>문서 근거로 AI 판정 · 직접 조정 가능</span>} />
          <div className="p-5 space-y-5">
            <div className="grid grid-cols-4 gap-1 text-[10px] text-slate-500">{[1, 2, 3, 4].map((l) => <div key={l}>Lv{l} {LV_LABEL[l].split(' · ')[1]}</div>)}</div>
            {(areas.data ?? []).map((a) => {
              const ls = a.elements.map((e) => scoreOf(a.id, e)?.level).filter((x): x is number => x != null);
              const areaAvg = ls.length ? Math.round((ls.reduce((x, y) => x + y, 0) / ls.length) * 10) / 10 : null;
              return (
                <div key={a.id}>
                  <div className="flex items-center gap-3 mb-1.5"><span className="font-semibold text-sm w-20">{a.name}</span><div className="flex-1"><MaturityBar level={areaAvg} /></div></div>
                  <ul className="pl-2 space-y-1">
                    {a.elements.map((e) => {
                      const s = scoreOf(a.id, e);
                      return (
                        <li key={e} className="grid grid-cols-[1fr_5rem] gap-2 items-center text-xs">
                          <span className={cx('truncate', s ? 'text-slate-700' : 'text-slate-400')} title={s?.evidence ?? '근거 없음'}>{e}</span>
                          <select className="text-xs border border-slate-200 rounded px-1 py-0.5" value={s?.level ?? ''} onChange={(ev) => ev.target.value && setLevel(a.id, e, Number(ev.target.value))}>
                            <option value="">-</option>
                            {[1, 1.5, 2, 2.5, 3, 3.5, 4].map((l) => <option key={l} value={l}>Lv {l.toFixed(1)}</option>)}
                          </select>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </>
  );
}
