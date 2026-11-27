import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Stethoscope } from 'lucide-react';
import { cx } from '../lib/format';
import { Brand } from '../components/Brand';
import { Button, Card } from '../components/ui';
import { HBars } from '../components/charts';

/* 셀프 체크 — CEO·인사담당자 15분 자가 점검 (로그인 없음, 서버 저장 없음)
   HR Maturity 영역과 HCG 이슈 라이브러리에 맞춰 '의심 이슈'를 짚어 준다. */
const AREAS = [
  { id: 'eval', name: '평가·성과관리', module: 'm1', items: ['연초에 개인 목표를 정하고 상사와 합의하는 절차가 있다', '팀장들이 연중에 팀원에게 정기적으로 피드백·코칭을 한다', '평가 등급이 실제 성과 차이를 잘 구분한다', '평가 결과가 연봉·성과급·승진에 의미 있는 차이를 만든다'],
    issue: '평가가 성과관리 도구가 아니라 연말 서열 매기기로 운영되고 있을 가능성이 큽니다. 목표 합의·중간 피드백·결과 활용 중 끊긴 고리를 찾아야 합니다.' },
  { id: 'grade', name: '직급·승진', module: 'm3', items: ['승진은 체류연한보다 역할 수행 능력으로 결정된다', '직급과 실제 역할(결재·책임)이 일치한다', '부·차장 비중이 지나치게 높지 않다(역피라미드가 아니다)'],
    issue: '연공 중심 직급·승진이 굳어져 인건비는 오르고 동기부여는 약해지는 구조일 수 있습니다.' },
  { id: 'reward', name: '보상', module: 'm2', items: ['기본급 인상이 일괄이 아니라 평가에 따라 차등된다', '성과급 지급 기준(재원·지급률)이 구성원에게 공개되어 있다', '동종업계 대비 보상 수준을 주기적으로 확인한다'],
    issue: '보상이 성과와 연결되지 않아 고성과자의 동기가 꺾이고 있을 가능성이 있습니다.' },
  { id: 'org', name: '조직·R&R', module: 'm4', items: ['조직별 역할과 책임(R&R)이 문서로 정리되어 있다', '위임전결 규정이 있고 대표이사 결재가 과도하지 않다', '팀장 1명이 맡는 인원이 적정하다(5명 이하 팀이 많지 않다)'],
    issue: '권한이 위에 몰리고 R&R이 불명확해 의사결정이 느리고 일이 떠넘겨질 수 있습니다.' },
  { id: 'people', name: '인력운영', module: 'm5', items: ['필요한 인력을 제때 채용하고 있다', '최근 1년 자발적 퇴사가 걱정할 수준이 아니다', '중간 직급(대리~과장)의 이탈이 적다'],
    issue: '허리층 이탈과 인력 부족이 업무 과중 → 추가 이탈의 악순환을 만들고 있을 수 있습니다.' },
  { id: 'culture', name: '리더십·문화', module: 'm6', items: ['팀장들 간 리더십 편차가 크지 않다', '부서 간 협업이 원활하다', '직원들이 회사 비전과 올해 목표를 알고 있다'],
    issue: '리더별 편차와 부서 간 단절(Silo)이 성과와 몰입을 깎고 있을 수 있습니다.' },
];
const SCALE = ['전혀 아니다', '아니다', '보통', '그렇다', '매우 그렇다'];

export default function SelfCheck() {
  const [ans, setAns] = useState<Record<string, number>>({});
  const [show, setShow] = useState(false);
  const all = AREAS.flatMap((a) => a.items.map((_, i) => `${a.id}-${i}`));
  const done = all.every((k) => ans[k]);
  const score = AREAS.map((a) => {
    const vs = a.items.map((_, i) => ans[`${a.id}-${i}`] ?? 0);
    return { ...a, score: Math.round(((vs.reduce((x, y) => x + y, 0) / vs.length - 1) / 4) * 100) };
  });
  const weak = [...score].sort((x, y) => x.score - y.score).slice(0, 3);

  return (
    <div className="min-h-screen">
      <header className="bg-white border-b border-slate-200"><div className="max-w-3xl mx-auto px-5 h-16 flex items-center justify-between"><Link to="/"><Brand /></Link><Link to="/login" className="text-sm text-indigo-700 font-semibold">로그인</Link></div></header>
      <main className="max-w-3xl mx-auto px-5 py-8">
        <div className="text-xs tracking-[0.18em] text-indigo-600 font-semibold">FREE SELF-CHECK</div>
        <h1 className="text-2xl font-bold mt-1">우리 회사 인사제도 셀프 체크</h1>
        <p className="text-sm text-slate-500 mt-1">대표이사·인사담당자용 19문항. 답변은 이 브라우저에서만 계산되고 저장되지 않습니다.</p>

        {!show ? (
          <div className="mt-6 space-y-5">
            {AREAS.map((a) => (
              <Card key={a.id} className="p-5">
                <div className="font-semibold mb-3">{a.name}</div>
                <div className="space-y-4">
                  {a.items.map((t, i) => {
                    const k = `${a.id}-${i}`;
                    return (
                      <div key={k}>
                        <div className="text-sm">{t}</div>
                        <div className="grid grid-cols-5 gap-1 mt-2">
                          {SCALE.map((s, v) => <button key={s} onClick={() => setAns({ ...ans, [k]: v + 1 })} className={cx('text-[11px] rounded-lg border py-1.5', ans[k] === v + 1 ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-slate-200 text-slate-500 hover:border-slate-300')}>{s}</button>)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            ))}
            <Button className="w-full" disabled={!done} onClick={() => { setShow(true); window.scrollTo(0, 0); }}>결과 보기 ({Object.keys(ans).length}/{all.length})</Button>
          </div>
        ) : (
          <div className="mt-6 space-y-5">
            <Card className="p-5">
              <div className="font-semibold mb-4">영역별 점수 (100점)</div>
              <HBars rows={score.map((s) => ({ label: s.name, value: s.score, tone: s.score < 50 ? 'bg-rose-400' : 'bg-indigo-500' }))} unit="" />
            </Card>
            <Card className="p-5">
              <div className="font-semibold">먼저 의심해 볼 이슈 3가지</div>
              <ol className="mt-3 space-y-3">
                {weak.map((w, i) => <li key={w.id} className="text-sm"><b>{i + 1}. {w.name}</b> <span className="text-slate-400 num">{w.score}점</span><p className="text-slate-600 mt-0.5">{w.issue}</p></li>)}
              </ol>
              <p className="text-xs text-slate-400 mt-4">경영진 한 사람의 시각입니다. 실제 구성원 인식과 제도 문서는 다를 수 있습니다. 그 차이(Say-Do)를 확인하는 것이 진단입니다.</p>
            </Card>
            <Card className="p-5 bg-slate-900 text-white border-slate-900">
              <div className="flex items-center gap-2 font-semibold"><Stethoscope size={18} />다음 단계</div>
              <p className="text-sm text-slate-300 mt-2">직원 설문·AI 인터뷰·제도 문서 점검으로 2주 안에 확인합니다. 전반을 보려면 <b className="text-white">HR 헬스체크</b>, {weak[0].name}이 가장 걱정이면 <b className="text-white">{weak[0].name} 딥진단</b>을 권합니다.</p>
              <Link to="/login" className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-white text-slate-900 font-semibold text-sm px-4 py-2">진단 시작하기 <ArrowRight size={14} /></Link>
            </Card>
            <button className="text-sm text-slate-500" onClick={() => setShow(false)}>답변 수정</button>
          </div>
        )}
      </main>
    </div>
  );
}
