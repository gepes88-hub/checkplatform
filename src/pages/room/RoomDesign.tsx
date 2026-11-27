import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Minus, Plus } from 'lucide-react';
import { supabase, q } from '../../lib/supabase';
import { cx } from '../../lib/format';
import type { Domain, Item, Segments } from '../../lib/types';
import { useRoom, RoomTitle } from '../../components/secure/SecureRoom';
import { Button, Card, CardHead, ErrorBox, Field, Pill, inputCls, useToast } from '../../components/ui';

const KIND: Record<string, string> = { likert: '5점', choice: '선택', multi: '복수선택', text: '주관식' };

export default function RoomDesign() {
  const { diag, refresh } = useRoom();
  const toast = useToast();
  const qc = useQueryClient();
  const seg = diag.settings.segments ?? ({ unit: [], level: [], role: [], tenure: [], age: [] } as Segments);
  const [units, setUnits] = useState('');
  const [lists, setLists] = useState({ level: '', role: '', tenure: '', age: '' });
  const [intro, setIntro] = useState(diag.settings.intro ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);

  useEffect(() => {
    setUnits(seg.unit.map((u) => `${u.name}${u.headcount ? `, ${u.headcount}` : ''}`).join('\n'));
    setLists({ level: seg.level.join(', '), role: seg.role.join(', '), tenure: seg.tenure.join(', '), age: seg.age.join(', ') });
  }, [diag.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const domains = useQuery({ queryKey: ['domains'], queryFn: () => q<Domain[]>(supabase.from('domains').select('*').order('sort')) });
  const mods = ['core', ...diag.modules];
  const bank = useQuery({
    queryKey: ['bank', diag.id],
    queryFn: () => q<Item[]>(supabase.from('items').select('*').or(`diagnosis_id.is.null,diagnosis_id.eq.${diag.id}`).order('sort')),
  });
  const chosen = useQuery({ queryKey: ['ditems', diag.id], queryFn: () => q<{ item_id: string; sort: number }[]>(supabase.from('diagnosis_items').select('item_id, sort').eq('diagnosis_id', diag.id)) });
  const chosenSet = useMemo(() => new Set((chosen.data ?? []).map((c) => c.item_id)), [chosen.data]);
  const domById = new Map((domains.data ?? []).map((d) => [d.id, d]));
  const visible = (bank.data ?? []).filter((i) => mods.includes(domById.get(i.domain_id)?.module ?? 'x'));

  const saveSeg = async () => {
    setBusy(true); setErr(null);
    try {
      const split = (s: string) => s.split(/[,，\n]/).map((x) => x.trim()).filter(Boolean);
      const unit = units.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
        const m = /^(.*?)[,\t]\s*(\d+)\s*명?$/.exec(l);
        return m ? { name: m[1].trim(), headcount: Number(m[2]) } : { name: l };
      });
      const segments: Segments = { unit, level: split(lists.level), role: split(lists.role), tenure: split(lists.tenure), age: split(lists.age) };
      const { error } = await supabase.from('diagnoses').update({ settings: { ...diag.settings, segments, intro: intro.trim() || undefined } }).eq('id', diag.id);
      if (error) throw error;
      refresh(); toast('저장했습니다');
    } catch (e) { setErr(e); } finally { setBusy(false); }
  };

  const toggle = async (id: string) => {
    if (chosenSet.has(id)) await supabase.from('diagnosis_items').delete().eq('diagnosis_id', diag.id).eq('item_id', id);
    else await supabase.from('diagnosis_items').insert({ diagnosis_id: diag.id, item_id: id, sort: (bank.data ?? []).findIndex((i) => i.id === id) + 1 });
    qc.invalidateQueries({ queryKey: ['ditems', diag.id] });
  };

  const [custom, setCustom] = useState({ domain: 'hr', text: '' });
  const addCustom = async () => {
    if (!custom.text.trim()) return;
    const id = `C_${diag.code}_${Date.now().toString(36)}`;
    const { error } = await supabase.from('items').insert({ id, diagnosis_id: diag.id, domain_id: custom.domain, text: custom.text.trim(), kind: 'likert', source: '맞춤', sort: 999 });
    if (error) { setErr(error); return; }
    await supabase.from('diagnosis_items').insert({ diagnosis_id: diag.id, item_id: id, sort: 999 });
    setCustom({ ...custom, text: '' });
    qc.invalidateQueries({ queryKey: ['bank', diag.id] }); qc.invalidateQueries({ queryKey: ['ditems', diag.id] });
  };

  const groups = (domains.data ?? []).filter((d) => mods.includes(d.module)).map((d) => ({ d, items: visible.filter((i) => i.domain_id === d.id) })).filter((g) => g.items.length);
  const likertCount = visible.filter((i) => chosenSet.has(i.id) && i.kind === 'likert').length;

  return (
    <>
      <RoomTitle title="진단 설계" sub="응답자 구분(조직·직급 등)과 설문 문항을 확정합니다. 조직별 인원을 넣으면 응답률을 볼 수 있습니다." />
      <div className="grid lg:grid-cols-[22rem_1fr] gap-5 items-start">
        <Card className="p-5 space-y-4">
          <div className="font-semibold">응답자 구분</div>
          <Field label="조직" hint="한 줄에 하나 · '영업본부, 32' 처럼 인원"><textarea className={cx(inputCls, 'h-32 font-mono text-xs')} value={units} onChange={(e) => setUnits(e.target.value)} placeholder={'경영지원본부, 18\n영업본부, 42\n생산본부, 120\n연구소, 25'} /></Field>
          <Field label="직급"><input className={inputCls} value={lists.level} onChange={(e) => setLists({ ...lists, level: e.target.value })} /></Field>
          <Field label="직책"><input className={inputCls} value={lists.role} onChange={(e) => setLists({ ...lists, role: e.target.value })} /></Field>
          <Field label="근속"><input className={inputCls} value={lists.tenure} onChange={(e) => setLists({ ...lists, tenure: e.target.value })} /></Field>
          <Field label="연령"><input className={inputCls} value={lists.age} onChange={(e) => setLists({ ...lists, age: e.target.value })} /></Field>
          <Field label="설문 첫 화면 안내문" hint="선택"><textarea className={cx(inputCls, 'h-20')} value={intro} onChange={(e) => setIntro(e.target.value)} placeholder="대표이사 인사말 등" /></Field>
          <p className="text-xs text-slate-500">응답자가 5명 미만인 구분은 분석에서 자동으로 숨겨집니다. 너무 잘게 나누지 마세요.</p>
          <ErrorBox error={err} />
          <Button onClick={saveSeg} loading={busy}>저장</Button>
        </Card>

        <Card>
          <CardHead title={`설문 문항 · 선택 ${chosenSet.size}개 (5점 ${likertCount}개)`} right={<span>약 {Math.max(5, Math.round(chosenSet.size * 0.22))}분 소요</span>} />
          <div className="p-5 space-y-6">
            {groups.map(({ d, items }) => (
              <div key={d.id}>
                <div className="flex items-baseline gap-2 mb-2">
                  <span className="font-semibold text-sm">{d.name}</span>
                  <span className="text-xs text-slate-400">{d.key_question}</span>
                </div>
                <ul className="space-y-1">
                  {items.map((i) => {
                    const on = chosenSet.has(i.id);
                    return (
                      <li key={i.id} className={cx('flex items-start gap-2 rounded-lg px-2 py-1.5 text-sm', on ? '' : 'opacity-45')}>
                        <button onClick={() => toggle(i.id)} className={cx('mt-0.5 w-5 h-5 rounded flex items-center justify-center shrink-0 border', on ? 'border-slate-300 text-slate-500 hover:text-rose-600' : 'border-indigo-300 text-indigo-600')} title={on ? '빼기' : '넣기'}>
                          {on ? <Minus size={12} /> : <Plus size={12} />}
                        </button>
                        <span className="flex-1">{i.text}{i.options && <span className="block text-xs text-slate-400 mt-0.5">{i.options.join(' / ')}</span>}</span>
                        <Pill>{KIND[i.kind]}</Pill>
                        {i.diagnosis_id && <Pill tone="violet">맞춤</Pill>}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
            <div className="border-t border-slate-100 pt-4">
              <div className="text-sm font-semibold mb-2">맞춤 문항 추가 (5점 척도)</div>
              <div className="flex gap-2 flex-wrap">
                <select className={cx(inputCls, 'w-40')} value={custom.domain} onChange={(e) => setCustom({ ...custom, domain: e.target.value })}>
                  {(domains.data ?? []).filter((d) => mods.includes(d.module) && !['extra'].includes(d.layer) && !d.id.endsWith('.choice') && !d.id.endsWith('.open')).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
                <input className={cx(inputCls, 'flex-1 min-w-[16rem]')} value={custom.text} onChange={(e) => setCustom({ ...custom, text: e.target.value })} placeholder="예: 나의 업무 실적은 시스템에 체계적으로 기록되고 있다." />
                <Button variant="secondary" onClick={addCustom}><Plus size={14} />추가</Button>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </>
  );
}
