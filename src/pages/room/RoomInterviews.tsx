import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, MessagesSquare, Plus, Trash2 } from 'lucide-react';
import { supabase, q } from '../../lib/supabase';
import { cx, fmtTime } from '../../lib/format';
import { TRACK_LABEL, type Invite, type Track } from '../../lib/types';
import { useRoom, RoomTitle } from '../../components/secure/SecureRoom';
import { Button, Card, CardHead, Empty, ErrorBox, Pill, inputCls, useToast } from '../../components/ui';

export default function RoomInterviews() {
  const { diag } = useRoom();
  const toast = useToast();
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ['invites', diag.id], queryFn: () => q<Invite[]>(supabase.from('interview_invites').select('*').eq('diagnosis_id', diag.id).order('created_at')), refetchInterval: 30000 });
  const [track, setTrack] = useState<Track>('exec');
  const [labels, setLabels] = useState('');
  const [err, setErr] = useState<unknown>(null);
  const [open, setOpen] = useState<string | null>(null);

  const add = async () => {
    const rows = labels.split('\n').map((l) => l.trim()).filter(Boolean).map((label) => ({ diagnosis_id: diag.id, track, label }));
    if (!rows.length) return;
    const { error } = await supabase.from('interview_invites').insert(rows);
    if (error) { setErr(error); return; }
    setLabels(''); qc.invalidateQueries({ queryKey: ['invites', diag.id] });
  };
  const remove = async (id: string) => {
    await supabase.from('interview_invites').delete().eq('id', id);
    qc.invalidateQueries({ queryKey: ['invites', diag.id] });
  };
  const link = (t: string) => `${window.location.origin}/i/${t}`;

  return (
    <>
      <RoomTitle title="AI 인터뷰" sub="대상자는 링크로 편한 시간에 15~20분 인터뷰합니다. HCG 질문표를 바탕으로 AI 컨설턴트가 꼬리질문합니다." />
      <div className="grid lg:grid-cols-[20rem_1fr] gap-5 items-start">
        <Card className="p-5 space-y-3">
          <div className="font-semibold">대상 추가</div>
          <div className="flex gap-1.5">
            {(['exec', 'leader', 'staff'] as Track[]).map((t) => (
              <button key={t} onClick={() => setTrack(t)} className={cx('flex-1 text-sm rounded-lg py-1.5 border', track === t ? 'border-indigo-500 bg-indigo-50 text-indigo-700 font-semibold' : 'border-slate-200')}>{TRACK_LABEL[t]}</button>
            ))}
          </div>
          <textarea className={cx(inputCls, 'h-28')} value={labels} onChange={(e) => setLabels(e.target.value)} placeholder={'한 줄에 한 명 (실명 대신 역할로)\n영업본부장\n생산본부장\nCFO'} />
          <ErrorBox error={err} />
          <Button onClick={add}><Plus size={14} />링크 만들기</Button>
          <p className="text-xs text-slate-500 leading-relaxed">권장: 임원 3~5명, 조직장 5~8명, 구성원 그룹 대표 3~5명. 인터뷰 원문은 HCG만 보고, 회사에는 익명 요약만 전달됩니다.</p>
        </Card>

        <Card>
          <CardHead title={`인터뷰 ${list.data?.length ?? 0}건`} right={<span>완료 {(list.data ?? []).filter((i) => i.status === 'done').length}</span>} />
          {!list.data?.length ? <Empty icon={<MessagesSquare size={18} />} title="아직 인터뷰 대상이 없습니다" /> : (
            <ul className="divide-y divide-slate-100">
              {list.data.map((i) => (
                <li key={i.id} className="px-5 py-3">
                  <div className="flex items-center gap-3">
                    <Pill tone={i.track === 'exec' ? 'violet' : i.track === 'leader' ? 'indigo' : 'slate'}>{TRACK_LABEL[i.track]}</Pill>
                    <span className="font-semibold text-sm flex-1 truncate">{i.label}</span>
                    <Pill tone={i.status === 'done' ? 'emerald' : i.status === 'started' ? 'amber' : 'slate'}>{i.status === 'done' ? '완료' : i.status === 'started' ? '진행 중' : '대기'}</Pill>
                    <button className="text-slate-400 hover:text-slate-700" title="링크 복사" onClick={() => { void navigator.clipboard.writeText(link(i.token)); toast('인터뷰 링크를 복사했습니다'); }}><Copy size={14} /></button>
                    {i.status !== 'done' && <button className="text-slate-300 hover:text-rose-600" title="삭제" onClick={() => remove(i.id)}><Trash2 size={14} /></button>}
                  </div>
                  {i.status === 'done' && i.summary && (
                    <div className="mt-2 ml-1">
                      <button className="text-xs text-indigo-700" onClick={() => setOpen(open === i.id ? null : i.id)}>{open === i.id ? '요약 닫기' : `요약 보기 · ${fmtTime(i.finished_at)}`}</button>
                      {open === i.id && (
                        <div className="mt-2 rounded-lg bg-slate-50 p-3 text-sm space-y-2">
                          <div className="font-semibold">{i.summary.one_line}</div>
                          <ul className="space-y-1.5">
                            {i.summary.key_points.map((k, n) => (
                              <li key={n} className="text-slate-700"><span className="text-xs text-slate-400 mr-1">[{k.domain}]</span>{k.point}{k.quote && <span className="block text-xs text-slate-500 mt-0.5">“{k.quote}”</span>}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
