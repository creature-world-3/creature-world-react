import { useState, useEffect, useRef } from 'react';
import { doc, updateDoc, deleteField, addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase/config.js';
import { CARDS } from '../../data/cards.js';
import { getGrowth } from '../../utils/growth.js';
import TowerTab from './TowerTab.jsx';

const GRADE_LABEL = { n:'N', r:'R', sr:'SR', ur:'UR', lg:'LEGEND', raid:'RAID' };
const GRADE_COLOR = { n:'#aaa', r:'#4a9eff', sr:'#c084fc', ur:'#fbbf24', lg:'#ff6b6b', raid:'#ffd700' };
const GRADE_BG    = { n:'rgba(80,80,80,0.9)', r:'#1a6fd4', sr:'#7c3aed', ur:'#d97706', lg:'#ff6b6b', raid:'#b8860b' };
const GRADE_RANGE = { n:[1,10], r:[11,20], sr:[21,30], ur:[31,40], lg:[51,60], raid:[56,65] };
const GRADES_ALL  = ['n','r','sr','ur','lg','raid'];

const DUNGEON_DURATION = 600;
const TICK_S = 3;
const MAX_DAILY = 3;
const FAIL_TICKETS = 30;
const STAGES = [
  { stage:1, threshold:20000,  tickets:50,  img:'/dungeons/farming/1단계파밍.png' },
  { stage:2, threshold:40000,  tickets:100, img:'/dungeons/farming/2단계파밍.png' },
  { stage:3, threshold:60000,  tickets:150, img:'/dungeons/farming/3단계파밍.png' },
  { stage:4, threshold:85000,  tickets:200, img:'/dungeons/farming/4단계파밍.png' },
  { stage:5, threshold:115000, tickets:250, img:'/dungeons/farming/5단계파밍.png' },
  { stage:6, threshold:150000, tickets:300, img:'/dungeons/farming/6단계파밍.png' },
];

// 50% tickets, 50% stones — stone probs sum to 50
const REWARD_TABLE = [
  { n:25, r:13, sr:7,  ur:3,  lg:1,  raid:1  },
  { n:15, r:17, sr:10, ur:4,  lg:2,  raid:2  },
  { n:8,  r:12, sr:16, ur:8,  lg:3,  raid:3  },
  { n:3,  r:6,  sr:10, ur:17, lg:9,  raid:5  },
  { n:1,  r:2,  sr:5,  ur:12, lg:20, raid:10 },
  { n:1,  r:1,  sr:3,  ur:5,  lg:20, raid:20 },
];

function todayKST() {
  return new Date(Date.now() + 9*3600*1000).toISOString().slice(0,10);
}
function calcAvgDmg(grade, cond, enh=0, bonus=0) {
  const [mn,mx] = GRADE_RANGE[grade]||[1,10];
  return Math.floor(((mn+mx)/2+(cond||1))*(1+enh*0.1))+bonus;
}
function calcTickDmg(grade, cond, enh=0, bonus=0) {
  const [mn,mx] = GRADE_RANGE[grade]||[1,10];
  return Math.floor((Math.floor(Math.random()*(mx-mn+1))+mn+(cond||1))*(1+enh*0.1))+bonus;
}
function dmgRangeStr(grade, cond, enh=0, bonus=0) {
  const [mn,mx] = GRADE_RANGE[grade]||[1,10];
  const m=1+enh*0.1;
  return `${Math.floor((mn+(cond||1))*m)+bonus}~${Math.floor((mx+(cond||1))*m)+bonus}`;
}
function fmtTime(s) {
  const m=Math.floor(s/60), sec=s%60;
  return `${m}:${String(sec).padStart(2,'0')}`;
}
function rollReward(stageIdx, finalDmg) {
  if (finalDmg < STAGES[stageIdx].threshold) {
    return { type:'tickets', amount:FAIL_TICKETS, success:false };
  }
  const roll = Math.random() * 100;
  if (roll < 50) return { type:'tickets', amount:STAGES[stageIdx].tickets, success:true };
  const probs = REWARD_TABLE[stageIdx];
  let cum = 50;
  for (const [grade, prob] of Object.entries(probs)) {
    cum += prob;
    if (roll < cum) return { type:'stone', grade, success:true };
  }
  return { type:'stone', grade:'n', success:true };
}
function groupByType(cards, bonusDmg) {
  const map = {};
  for (const inst of cards) {
    const def = CARDS.find(c => c.id === inst.id);
    if (!def) continue;
    if (!map[inst.id]) map[inst.id] = { def, instances:[] };
    map[inst.id].instances.push(inst);
  }
  const groups = Object.values(map);
  groups.forEach(g => {
    const bDmg = getGrowth(bonusDmg, g.instances[0]) || 0;
    g.instances.sort((a,b) =>
      calcAvgDmg(g.def.grade,b.condition,b.enhanceLevel||0,bDmg) -
      calcAvgDmg(g.def.grade,a.condition,a.enhanceLevel||0,bDmg)
    );
    g.bestDmg = calcAvgDmg(g.def.grade,g.instances[0].condition,g.instances[0].enhanceLevel||0,bDmg);
  });
  groups.sort((a,b) => b.bestDmg - a.bestDmg);
  return groups;
}

export default function DungeonTab({ gs, setGs, user, isGuest, onSubTabChange: _unused }) {
  const [dungeonSub, setDungeonSub] = useState('farming'); // 'farming' | 'tower'

  const [stageIdx, setStageIdx]           = useState(0);
  const [selectedCards, setSelectedCards] = useState([]);
  const [pickGrade, setPickGrade]         = useState(null);
  const [pickExpanded, setPickExpanded]   = useState(null);
  const [phase, setPhase]                 = useState('select');
  const [elapsed, setElapsed]             = useState(0);
  const [totalDmg, setTotalDmg]           = useState(0);
  const [dmgFloats, setDmgFloats]         = useState([]);
  const [bossShaking, setBossShaking]     = useState(false);
  const [result, setResult]               = useState(null);
  const [toast, setToast]                 = useState(null);
  const [infoOpen, setInfoOpen]           = useState(false);

  const toastRef    = useRef(null);
  const timerRef    = useRef(null);
  const battleRef   = useRef(null);
  const floatIdRef  = useRef(0);
  const totalDmgRef = useRef(0);
  const restoredRef = useRef(false);
  const finishedRef = useRef(false);
  const gsRef       = useRef(gs);
  useEffect(() => { gsRef.current = gs; }, [gs]);

  const showToast = msg => {
    clearTimeout(toastRef.current);
    setToast(msg);
    toastRef.current = setTimeout(() => setToast(null), 2500);
  };

  const today      = todayKST();
  const bonusDmg   = gs?.cardBonusDmg || {};
  const ownedCards = gs?.ownedCards || [];

  const dailyCount = (() => {
    const a = gs?.dungeonAttempt;
    return (!a || a.date !== today) ? 0 : (a.count||0);
  })();
  const attemptsLeft = MAX_DAILY - dailyCount;

  const finishBattle = (finalDmg, stageI) => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    const reward = rollReward(stageI, finalDmg);
    const prevCount = (() => {
      const a = gsRef.current?.dungeonAttempt;
      return (!a || a.date !== today) ? 0 : (a.count||0);
    })();
    const newCount = prevCount + 1;

    setGs(prev => {
      const next = {
        ...prev,
        dungeonAttempt: { date:today, count:newCount },
        dungeonBattle: null,
      };
      if (reward.type === 'tickets') next.tickets = (prev.tickets||0) + reward.amount;
      return next;
    });

    if (user) {
      const updates = {
        dungeonAttempt: { date:today, count:newCount },
        dungeonBattle: deleteField(),
      };
      if (reward.type === 'tickets') {
        // gsRef를 직접 쓰지 않고 setGs 콜백의 prev 값을 Firestore에 반영하기 위해
        // setGs 내부에서 처리된 tickets 값을 사용
        updates.tickets = (gsRef.current?.tickets||0) + reward.amount;
      }
      updateDoc(doc(db,'users',user.uid), updates).catch(e => console.error('[dungeon finish]', e));
      if (reward.type === 'stone') {
        addDoc(collection(db,'mailbox'), {
          title: `파밍 던전 ${reward.success ? '클리어' : ''} 보상`,
          message: `${STAGES[stageI].stage}단계 클리어! ${GRADE_LABEL[reward.grade]} 성장석 1개를 드립니다.`,
          targetUid: user.uid,
          reward: { type:'enhanceStone', grade:reward.grade, amount:1 },
          createdAt: serverTimestamp(),
        }).catch(e => console.error('[dungeon stone mail]', e));
      }
    }
    setResult(reward);
    setPhase('result');
  };

  // Restore offline battle
  useEffect(() => {
    if (!user || !gs?.ownedCards?.length || restoredRef.current) return;
    restoredRef.current = true;
    const fb = gs?.dungeonBattle;
    if (!fb || fb.date !== today) return;

    const restoredCards = [];
    for (const s of (fb.slots||[])) {
      const inst = (gs.ownedCards||[]).find(c => c.uid === s.cardInstUid);
      const def  = CARDS.find(c => c.id === s.cardId);
      if (inst && def) restoredCards.push({ cardDef:def, inst });
    }
    if (!restoredCards.length) return;

    const elapsedSec = Math.floor((Date.now() - fb.startTime) / 1000);
    const avgTickDmg = restoredCards.reduce((sum, s) => {
      const bD = getGrowth(fb.bonusDmg, s.inst);
      return sum + calcAvgDmg(s.cardDef.grade, s.inst.condition, s.inst.enhanceLevel||0, bD);
    }, 0);
    const stageI = (fb.stage||1) - 1;
    setStageIdx(stageI);
    setSelectedCards(restoredCards);

    if (elapsedSec >= DUNGEON_DURATION) {
      const estimatedDmg = Math.floor(DUNGEON_DURATION / TICK_S) * avgTickDmg;
      totalDmgRef.current = estimatedDmg;
      setTotalDmg(estimatedDmg);
      setElapsed(DUNGEON_DURATION);
      finishBattle(estimatedDmg, stageI);
    } else {
      const estimatedDmg = Math.floor(elapsedSec / TICK_S) * avgTickDmg;
      totalDmgRef.current = estimatedDmg;
      setTotalDmg(estimatedDmg);
      setElapsed(elapsedSec);
      battleRef.current = {
        slots: Object.fromEntries(restoredCards.map(s => [s.cardDef.grade, s])),
        bonusDmg: fb.bonusDmg||{},
        stage: fb.stage||1,
      };
      setPhase('battle');
    }
  }, [user, gs?.ownedCards?.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Battle timer
  useEffect(() => {
    if (phase !== 'battle') { clearInterval(timerRef.current); return; }
    timerRef.current = setInterval(() => {
      setElapsed(prev => {
        const next = prev + 1;
        if (next % TICK_S === 0 && battleRef.current) {
          let dmg = 0;
          Object.values(battleRef.current.slots).forEach(slot => {
            if (!slot) return;
            const liveInst = gsRef.current?.ownedCards?.find(c => c.uid === slot.inst.uid) || slot.inst;
            const liveBDmg = getGrowth(gsRef.current?.cardBonusDmg, liveInst);
            dmg += calcTickDmg(slot.cardDef.grade, liveInst.condition, liveInst.enhanceLevel||0, liveBDmg);
          });
          totalDmgRef.current += dmg;
          setTotalDmg(d => d + dmg);
          setBossShaking(true);
          setTimeout(() => setBossShaking(false), 500);
          const fid = ++floatIdRef.current;
          setDmgFloats(prev => [...prev, { id:fid, dmg }]);
          setTimeout(() => setDmgFloats(prev => prev.filter(f => f.id !== fid)), 1200);
          // 체력 0 → 즉시 클리어
          const threshold = STAGES[(battleRef.current.stage||1)-1].threshold;
          if (totalDmgRef.current >= threshold && !finishedRef.current) {
            finishedRef.current = true; // 즉시 플래그 세팅 (이중 호출 방지)
            clearInterval(timerRef.current);
            setTimeout(() => finishBattle(totalDmgRef.current, (battleRef.current.stage||1)-1), 0);
            return next;
          }
        }
        if (next >= DUNGEON_DURATION) { clearInterval(timerRef.current); return DUNGEON_DURATION; }
        return next;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  // Detect battle completion
  useEffect(() => {
    if (phase === 'battle' && elapsed >= DUNGEON_DURATION) {
      finishBattle(totalDmgRef.current, (battleRef.current?.stage||1) - 1);
    }
  }, [elapsed, phase]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleStart = async () => {
    if (isGuest) { showToast('로그인이 필요합니다'); return; }
    if (attemptsLeft <= 0) { showToast('오늘 도전 횟수를 모두 사용했어요'); return; }
    if (selectedCards.length === 0) { showToast('카드를 선택해주세요'); return; }
    const stage = STAGES[stageIdx].stage;
    battleRef.current = {
      slots: Object.fromEntries(selectedCards.map(s => [s.cardDef.grade, s])),
      bonusDmg: { ...bonusDmg },
      stage,
    };
    finishedRef.current = false;
    totalDmgRef.current = 0;
    setElapsed(0); setTotalDmg(0); setDmgFloats([]); setResult(null);
    const fbData = {
      date: today,
      startTime: Date.now(),
      stage,
      slots: selectedCards.map(s => ({ cardInstUid:s.inst.uid, cardId:s.cardDef.id })),
      bonusDmg: { ...bonusDmg },
    };
    setGs(prev => ({ ...prev, dungeonBattle:fbData }));
    if (user) {
      try { await updateDoc(doc(db,'users',user.uid), { dungeonBattle:fbData }); }
      catch(e) { console.error('[dungeon start]', e); }
    }
    setPhase('battle');
  };

  const handleReset = () => {
    clearInterval(timerRef.current);
    finishedRef.current = false;
    totalDmgRef.current = 0;
    setSelectedCards([]); setElapsed(0); setTotalDmg(0);
    setDmgFloats([]); setResult(null); setPhase('select');
  };

  const handleAutoSelect = () => {
    if (isGuest) { showToast('로그인이 필요합니다'); return; }
    const autoSelected = [];
    for (const grade of GRADES_ALL) {
      const gradeInsts = ownedCards.filter(oc => CARDS.find(c => c.id === oc.id)?.grade === grade);
      if (!gradeInsts.length) continue;
      let bestInst = gradeInsts[0], bestDmg = -Infinity;
      for (const inst of gradeInsts) {
        const bD = bonusDmg[inst.uid] || bonusDmg[inst.id] || 0;
        const dmg = calcAvgDmg(grade, inst.condition, inst.enhanceLevel || 0, bD);
        if (dmg > bestDmg) { bestDmg = dmg; bestInst = inst; }
      }
      const cardDef = CARDS.find(c => c.id === bestInst.id);
      if (cardDef) autoSelected.push({ cardDef, inst: bestInst });
    }
    setSelectedCards(autoSelected);
    showToast('등급별 최강 카드로 자동 선택됐어요!');
  };

  const estimatedDmg = selectedCards.reduce((sum, s) => {
    const bD = bonusDmg[s.inst.uid] || bonusDmg[s.cardDef.id] || 0;
    return sum + calcAvgDmg(s.cardDef.grade, s.inst.condition, s.inst.enhanceLevel||0, bD);
  }, 0) * Math.floor(DUNGEON_DURATION / TICK_S);

  const currentStage = STAGES[stageIdx];
  const progressPct  = Math.min(100, (totalDmg / currentStage.threshold) * 100);

  const pickerGroups = pickGrade
    ? groupByType(ownedCards.filter(oc => CARDS.find(c => c.id === oc.id)?.grade === pickGrade), bonusDmg)
    : [];

  return (
    <div className="dungeon-sub-wrap">
      {/* 서브탭 */}
      <div className="subtab-bar dungeon-subtab-bar">
        <button
          className={`subtab-btn${dungeonSub === 'farming' ? ' active' : ''}`}
          onClick={() => setDungeonSub('farming')}
        >파밍 던전</button>
        <button
          className={`subtab-btn${dungeonSub === 'tower' ? ' active tower-sub' : ''}`}
          onClick={() => setDungeonSub('tower')}
        >도전의 탑</button>
      </div>

      {/* 도전의 탑 */}
      {dungeonSub === 'tower' && (
        <TowerTab gs={gs} setGs={setGs} user={user} isGuest={isGuest} />
      )}

      {/* 파밍 던전 */}
      {dungeonSub === 'farming' && <>
      {/* 이미지 프리로드 */}
      <div style={{display:'none'}}>
        {STAGES.map(s => <img key={s.stage} src={s.img} alt="" />)}
      </div>
      {toast && <div className="cw-toast">{toast}</div>}

      {/* 안내 모달 */}
      {infoOpen && (
        <div className="card-zoom-overlay" onClick={() => setInfoOpen(false)}>
          <div className="dungeon-info-sheet" onClick={e => e.stopPropagation()}>
            <div className="dungeon-info-title">파밍 던전 안내</div>

            <div className="dungeon-info-scroll">
              {/* 기본 규칙 */}
              <div>
                <div className="dungeon-info-section-title">기본 규칙</div>
                <div className="dungeon-info-rules">
                  {[
                    '단계를 선택하고 카드를 출격시켜 10분간 자동 전투합니다.',
                    '카드는 1장 이상이면 시작 가능. 등급별 최대 1장, 총 6장까지.',
                    '10분 안에 목표 데미지를 달성하면 클리어 보상을 드려요.',
                    '실패해도 위로 보상으로 도토리 30장을 드립니다.',
                    '앱을 꺼도 전투는 자동으로 진행돼요. 클리어 후 재시작은 없어요.',
                    '하루 총 3회 도전 가능. 성공·실패 모두 차감됩니다.',
                  ].map((rule, i) => (
                    <div key={i} className="dungeon-info-rule">
                      <span className="dungeon-info-rule-dot" />
                      <span>{rule}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* 단계별 보상 */}
              <div>
                <div className="dungeon-info-section-title">단계별 보상 확률</div>
                <div className="dg-info-stage-list">
                  {STAGES.map((s, i) => {
                    const probs = REWARD_TABLE[i];
                    const stoneColors = {
                      n:    { bg:'#e5e5e5', text:'#555' },
                      r:    { bg:'#dbeafe', text:'#1d4ed8' },
                      sr:   { bg:'#ede9fe', text:'#6d28d9' },
                      ur:   { bg:'#fef3c7', text:'#b45309' },
                      lg:   { bg:'#fee2e2', text:'#b91c1c' },
                      raid: { bg:'#fef9c3', text:'#92400e' },
                    };
                    return (
                      <div key={s.stage} className="dg-info-stage-card">
                        <div className="dg-info-stage-header">
                          <span className="dg-info-stage-label">{s.stage}단계</span>
                          <span className="dg-info-stage-threshold">목표 {s.threshold.toLocaleString()} 데미지</span>
                        </div>
                        <div className="dg-info-stage-body">
                          <div className="dg-info-ticket-row">
                            <span className="dg-info-ticket-badge">50%</span>
                            <span className="dg-info-ticket-label">도토리</span>
                            <span className="dg-info-ticket-val">+{s.tickets}장</span>
                          </div>
                          <div className="dg-info-ticket-row" style={{marginBottom:4}}>
                            <span className="dg-info-ticket-badge">50%</span>
                            <span className="dg-info-ticket-label">성장석</span>
                          </div>
                          <div className="dg-info-stone-row">
                            {Object.entries(probs).map(([grade, prob]) => {
                              const c = stoneColors[grade];
                              return (
                                <span key={grade} className="dg-info-stone-badge"
                                  style={{background:c.bg, color:c.text}}>
                                  {GRADE_LABEL[grade]}
                                  <span className="dg-info-stone-prob">{prob}%</span>
                                </span>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <button className="zoom-close" onClick={() => setInfoOpen(false)}>닫기 ✕</button>
          </div>
        </div>
      )}

      {/* 카드 픽커 모달 */}
      {pickGrade && (
        <div className="card-zoom-overlay" onClick={() => { setPickGrade(null); setPickExpanded(null); }}>
          <div className="inst-sheet picker-sheet" onClick={e => e.stopPropagation()}>
            <div className="picker-sheet-header">
              {pickExpanded && (
                <button className="picker-back-btn" onClick={e => { e.stopPropagation(); setPickExpanded(null); }}>←</button>
              )}
              <span className="picker-sheet-title">
                <span style={{color:GRADE_COLOR[pickGrade],fontFamily:'Nunito',fontWeight:900}}>{GRADE_LABEL[pickGrade]}</span>
                {pickExpanded ? ' 중복 카드 선택' : ' 등급 카드 선택'}
              </span>
              <span className="inst-sheet-count">{pickerGroups.length}종</span>
            </div>
            <div className="picker-scroll-area">
              {pickerGroups.length === 0 ? (
                <div className="picker-empty">{GRADE_LABEL[pickGrade]} 등급 카드가 없어요</div>
              ) : pickExpanded ? (() => {
                const grp = pickerGroups.find(g => g.def.id === pickExpanded);
                if (!grp) return null;
                const { def, instances } = grp;
                const bD = bonusDmg[instances[0]?.uid] || bonusDmg[def.id] || 0;
                return (
                  <div className="card-picker-grid">
                    {instances.map((inst, i) => {
                      const cond=inst.condition||1, enh=inst.enhanceLevel||0;
                      const cc=cond>=9?'#d97706':cond>=6?'#7c3aed':'#888';
                      return (
                        <div key={inst.uid} className={`card-picker-item grade-${def.grade}`}
                          style={{animationDelay:`${i*60}ms`}}
                          onClick={() => {
                            setSelectedCards(prev => [...prev.filter(s => s.cardDef.grade !== def.grade), { cardDef:def, inst }]);
                            setPickGrade(null); setPickExpanded(null);
                          }}>
                          <div className="card-picker-img">
                            <img src={`/${def.img}`} alt={def.name} />
                            {enh > 0 && <div className="card-picker-enhance">+{enh}</div>}
                          </div>
                          <div className="card-picker-info">
                            <div className="card-picker-name">{def.name}</div>
                            <div className="card-picker-sub" style={{color:cc}}>컨디션 {cond}</div>
                            <div className="card-picker-dmg">평균 {calcAvgDmg(def.grade,cond,enh,bD)}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })() : (
                <div className="card-picker-grid">
                  {pickerGroups.map(({ def, instances, bestDmg }) => {
                    const bD = instances.length === 1 ? (bonusDmg[instances[0].uid]||bonusDmg[def.id]||0) : 0;
                    const pick = inst => {
                      setSelectedCards(prev => [...prev.filter(s => s.cardDef.grade !== def.grade), { cardDef:def, inst }]);
                      setPickGrade(null); setPickExpanded(null);
                    };
                    return (
                      <div key={def.id} className={`card-picker-item grade-${def.grade}`}
                        onClick={() => instances.length > 1 ? setPickExpanded(def.id) : pick(instances[0])}>
                        <div className="card-picker-img">
                          <img src={`/${def.img}`} alt={def.name} />
                          {instances.length > 1 && <div className="card-picker-dup">×{instances.length}</div>}
                        </div>
                        <div className="card-picker-info">
                          <div className="card-picker-name">{def.name}</div>
                          <div className="card-picker-dmg">
                            평균 {bestDmg}
                            {bD > 0 && <span className="growth-bonus-tag" style={{marginLeft:3}}>+{bD}</span>}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <button className="zoom-close" onClick={() => { setPickGrade(null); setPickExpanded(null); }}>닫기 ✕</button>
          </div>
        </div>
      )}

      {/* ── 카드 선택 화면 ── */}
      {phase === 'select' && (
        <>
          <div className="dungeon-section-header">
            <div className="dungeon-section-title">파밍 던전</div>
            <button className="dungeon-info-btn" onClick={() => setInfoOpen(true)}>설명</button>
          </div>

          {/* 단계 선택 */}
          <div className="dg-stage-selector">
            <button className="dg-stage-arrow" onClick={() => setStageIdx(i => Math.max(0,i-1))} disabled={stageIdx===0}>‹</button>
            <div className="dg-stage-card">
              <img key={stageIdx} src={currentStage.img} alt="boss" className="dg-stage-boss-img" />
              <div className="dg-stage-info">
                <div className="dg-stage-num">{currentStage.stage}단계</div>
                <div className="dg-stage-threshold">목표 <strong>{currentStage.threshold.toLocaleString()}</strong></div>
                <div className="dg-stage-dots">
                  {STAGES.map((_,i) => (
                    <span key={i} className={`dg-stage-dot${i===stageIdx?' active':''}`} onClick={() => setStageIdx(i)} />
                  ))}
                </div>
              </div>
            </div>
            <button className="dg-stage-arrow" onClick={() => setStageIdx(i => Math.min(5,i+1))} disabled={stageIdx===5}>›</button>
          </div>

          {/* 예상 데미지 */}
          <div className={`dg-estimate-wrap${selectedCards.length===0?'':estimatedDmg>=currentStage.threshold?' pass':' fail'}`}>
            {selectedCards.length > 0 ? (
              <>
                <span className="dg-estimate-label">예상 10분 데미지</span>
                <strong className="dg-estimate-val">{estimatedDmg.toLocaleString()}</strong>
                <span className="dg-estimate-verdict">
                  {estimatedDmg >= currentStage.threshold
                    ? '✓ 클리어 가능'
                    : `✗ ${(currentStage.threshold - estimatedDmg).toLocaleString()} 부족`}
                </span>
              </>
            ) : (
              <span className="dg-estimate-placeholder">카드를 선택하면 예상 데미지가 표시돼요</span>
            )}
          </div>

          {/* 카드 슬롯 */}
          <div className="farm-sel-header">
            참여 카드 선택 <span className="farming-slots-count">{selectedCards.length}/6</span>
            <button className="farm-auto-btn" onClick={handleAutoSelect} disabled={isGuest}>자동선택</button>
          </div>
          <div className="farm-sel-slots">
            {GRADES_ALL.map(grade => {
              const sel      = selectedCards.find(s => s.cardDef.grade === grade);
              const hasCards = ownedCards.some(oc => CARDS.find(c => c.id === oc.id)?.grade === grade);
              return (
                <div key={grade}
                  className={`farm-sel-slot${sel?' filled':''}${!hasCards&&!sel?' no-card':''}`}
                  onClick={() => {
                    if (isGuest) { showToast('로그인이 필요합니다'); return; }
                    if (sel) setSelectedCards(prev => prev.filter(s => s.inst.uid !== sel.inst.uid));
                    else if (!hasCards) showToast(`${GRADE_LABEL[grade]} 등급 카드가 없어요`);
                    else { setPickGrade(grade); setPickExpanded(null); }
                  }}>
                  {sel ? (
                    <>
                      <img src={`/${sel.cardDef.img}`} alt={sel.cardDef.name} />
                      <div className="farm-sel-grade-tag" style={{background:GRADE_BG[grade]}}>{GRADE_LABEL[grade]}</div>
                      <button className="farm-sel-remove"
                        onClick={e => { e.stopPropagation(); setSelectedCards(prev => prev.filter(s => s.inst.uid !== sel.inst.uid)); }}>×</button>
                    </>
                  ) : (
                    <div className="farm-sel-empty">
                      <div className="farm-sel-empty-grade" style={{color:hasCards?GRADE_COLOR[grade]:'var(--muted)'}}>{GRADE_LABEL[grade]}</div>
                      <div style={{fontSize:'1.2rem',opacity:hasCards?0.5:0.2,lineHeight:1}}>+</div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* 도전 횟수 */}
          <div className="growth-detail-attempts" style={{justifyContent:'center',marginTop:4}}>
            <span>남은 도전</span>
            <div className="gbc-attempts" style={{display:'inline-flex',marginLeft:8}}>
              {[...Array(MAX_DAILY)].map((_,i) => (
                <span key={i} className={`gbc-dot${i >= attemptsLeft ? ' used' : ''}`} />
              ))}
            </div>
            <span style={{marginLeft:8,fontWeight:900,fontSize:'0.88rem',
              color:attemptsLeft===0?'var(--muted)':'var(--blue-dark)'}}>
              {attemptsLeft}회
            </span>
          </div>

          <button className="dungeon-primary-btn"
            onClick={handleStart}
            disabled={attemptsLeft<=0||selectedCards.length===0||isGuest}
            style={(attemptsLeft<=0||selectedCards.length===0||isGuest)?{opacity:0.45,cursor:'not-allowed'}:{}}>
            {isGuest ? '로그인이 필요합니다'
              : attemptsLeft<=0 ? '오늘 도전 완료'
              : selectedCards.length===0 ? '카드를 선택하세요'
              : '시작하기'}
          </button>
        </>
      )}

      {/* ── 전투 화면 ── */}
      {phase === 'battle' && (
        <div className="dg-farm-battle-wrap">
          {/* 보스 이미지 확대 */}
          <div className="dg-farm-boss-fullwrap">
            <img
              src={STAGES[(battleRef.current?.stage||1)-1].img}
              className={`dg-farm-boss-large${bossShaking?' dg-boss-shaking':''}`}
              alt="boss"
            />
            <div className="dg-boss-vignette" />
            {dmgFloats.map(f => (
              <div key={f.id} className="dg-dmg-float">-{f.dmg.toLocaleString()}</div>
            ))}
            <div className="dg-farm-stage-badge">{battleRef.current?.stage}단계</div>
          </div>

          {/* 체력 & 시간 - 이미지 아래 */}
          {(() => {
            const stI = (battleRef.current?.stage||1) - 1;
            const threshold = STAGES[stI].threshold;
            const hpLeft = Math.max(0, threshold - totalDmg);
            const hpPct  = Math.max(0, 100 - progressPct);
            const hpColor = hpPct > 60 ? '#4ade80' : hpPct > 30 ? '#fbbf24' : '#f87171';
            return (
              <div className="dg-farm-status">
                <div className="dg-farm-status-row">
                  <div className="dg-farm-status-col">
                    <div className="dg-farm-status-label">남은 시간</div>
                    <div className="dg-farm-timer">{fmtTime(DUNGEON_DURATION - elapsed)}</div>
                  </div>
                  <div className="dg-farm-status-col" style={{textAlign:'right'}}>
                    <div className="dg-farm-status-label">누적 데미지</div>
                    <div className="dg-farm-total-dmg">{totalDmg.toLocaleString()}</div>
                  </div>
                </div>
                <div className="dg-farm-hp-row">
                  <span className="dg-farm-status-label">남은 체력</span>
                  <span className="dg-farm-hp-num" style={{color:hpColor}}>{hpLeft.toLocaleString()}</span>
                </div>
                <div className="dg-farm-hp-bar">
                  <div className="dg-farm-hp-fill" style={{width:`${hpPct}%`, background:hpColor}} />
                </div>
              </div>
            );
          })()}
          <div className="dg-farm-cards-section">
            <div className="dg-my-label">
              <span className="dg-tick-dot" style={{background:'#4a9eff',boxShadow:'0 0 6px #4a9eff'}} />
              출격 카드
            </div>
            <div className="dg-farm-cards">
              {selectedCards.map(({ cardDef, inst:savedInst }) => {
                const inst = (gs?.ownedCards||[]).find(c => c.uid === savedInst.uid) || savedInst;
                const bD = getGrowth(gs?.cardBonusDmg, inst);
                return (
                  <div key={savedInst.uid} className={`dg-farm-card grade-${cardDef.grade}`}>
                    <div className="dg-farm-card-img">
                      <img src={`/${cardDef.img}`} alt={cardDef.name} />
                      <div className="dg-farm-card-grade-tag" style={{background:GRADE_BG[cardDef.grade]}}>{GRADE_LABEL[cardDef.grade]}</div>
                    </div>
                    <div className="dg-farm-card-name">{cardDef.name}</div>
                    <div className="dg-farm-card-dmg">{dmgRangeStr(cardDef.grade,inst.condition,inst.enhanceLevel||0,bD)}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── 결과 화면 ── */}
      {phase === 'result' && result && (
        <div className="farming-done-wrap">
          <div className="farming-done-title" style={result.success?{}:{color:'var(--muted)'}}>
            {result.success ? '클리어!' : '도전 실패'}
          </div>
          <div className="farming-done-boss">
            <img src={STAGES[stageIdx].img} alt="boss"
              style={result.success ? {} : {filter:'grayscale(0.6)',opacity:0.7}} />
          </div>
          <div className="farming-done-stats">
            <div className="farming-done-stat">
              <span className="farming-done-stat-label">총 데미지</span>
              <span className="farming-done-stat-val">{totalDmg.toLocaleString()}</span>
            </div>
            <div className="farming-done-stat">
              <span className="farming-done-stat-label">목표 데미지</span>
              <span className="farming-done-stat-val">{STAGES[stageIdx].threshold.toLocaleString()}</span>
            </div>
            <div className="farming-done-stat highlight">
              <span className="farming-done-stat-label">획득 보상</span>
              <span className="farming-done-stat-val">
                {result.type === 'tickets'
                  ? `도토리 +${result.amount}장`
                  : `${GRADE_LABEL[result.grade]} 성장석 ×1`}
              </span>
            </div>
            {!result.success && (
              <div style={{fontSize:'0.78rem',color:'var(--muted)',textAlign:'center'}}>
                위로 보상으로 도토리 30장을 드렸어요
              </div>
            )}
          </div>
          <button className="dungeon-primary-btn" onClick={handleReset} style={{marginTop:16}}>확인</button>
        </div>
      )}
      </>}
    </div>
  );
}
