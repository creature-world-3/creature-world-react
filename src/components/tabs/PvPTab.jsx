import { useState, useEffect, useRef } from 'react';
import { CARDS } from '../../data/cards.js';
import {
  enterQueue, leaveQueue, clearUMatch,
  submitPvpPick, submitPvpSwitch,
  subscribeQueue, subscribeMatch, subscribeUMatch,
  createPvpMatch, batchPvpUpdate,
  PVP_MATCH_PATH, PVP_USER_MATCH_PATH, PVP_QUEUE_PATH,
} from '../../utils/pvpUtils.js';

// ── PvP 상수 ──
// 코스트 6은 예약(미사용)
const PVP_COST  = { n:1, r:2, sr:3, ur:4, lg:5, raid:7, awakened:8 };
const PVP_HP    = { n:300, r:600, sr:1000, ur:1600, lg:2400, raid:3600, awakened:5000 };
// 배율: 풀강(5)+성장(10)+레벨1, 컨디션 6 기준 역산값
// N≈55, R≈89, SR≈119, UR≈145, LG≈170, RAID≈217, 각성≈236
const PVP_MULT  = { n:2.0, r:2.1, sr:2.1, ur:2.0, lg:1.65, raid:1.95, awakened:1.52 };
const GRADE_RANGE = { n:[1,10], r:[11,20], sr:[21,30], ur:[31,40], lg:[51,60], raid:[56,65], awakened:[80,100] };
const GRADE_LABEL = { n:'N', r:'R', sr:'SR', ur:'UR', lg:'LG', raid:'RAID', awakened:'각성' };
const GRADE_COLOR = { n:'#888', r:'#4a9eff', sr:'#c084fc', ur:'#fbbf24', lg:'#ff6b6b', raid:'#ffd700', awakened:'#b347ff' };
const MAX_DECK = 5;
const MAX_COST = 10;
const MATCH_TIMEOUT = 60_000;
// 보상: 승리 시 도토리 지급 — TODO: 추후 시즌 포인트·전적 기록·승률 통계 등으로 확장 예정
const WIN_REWARD = 50;

// RTDB는 배열을 숫자키 객체로 변환하므로 안전하게 배열로 변환
const toArr = (v) => {
  if (!v) return [];
  if (Array.isArray(v)) return v;
  return Object.keys(v).sort((a, b) => Number(a) - Number(b)).map(k => v[k]);
};

function calcPvpDmg(grade, condition, enhanceLevel, levelCount, growth) {
  const [mn, mx] = GRADE_RANGE[grade] || [1, 10];
  const rnd  = mn + Math.random() * (mx - mn);
  const mult = 1 + (enhanceLevel || 0) * 0.1 + (levelCount || 0) * 0.02;
  const base = Math.floor((rnd + (condition || 1)) * mult) + (growth || 0);
  return Math.max(1, Math.floor(base * (PVP_MULT[grade] || 1.0)));
}

const GRADE_SORT = ['awakened','raid','lg','ur','sr','r','n'];

export default function PvPTab({ gs, setGs, user, isGuest }) {
  const [screen, setScreen]               = useState('deck');
  const [deck, setDeck]                   = useState([]);
  const [matchId, setMatchId]             = useState(null);
  const [matchData, setMatchData]         = useState(null);
  const [myPick, setMyPick]               = useState(null);
  const [mySwitchChoice, setMySwitchChoice] = useState(null);
  const [rewardApplied, setRewardApplied] = useState(false);
  const [toast, setToast]                 = useState(null);

  const toastTimer   = useRef(null);
  const matchTimer   = useRef(null);
  const resolvingRef = useRef(false);
  const queueUnsubRef  = useRef(null);
  const matchUnsubRef  = useRef(null);
  const umatchUnsubRef = useRef(null);

  const uid      = user?.uid;
  const nickname = gs?.nickname || user?.displayName || '플레이어';

  // host: uid 정렬 시 첫 번째 플레이어가 턴 해소 담당
  const uids   = matchData ? Object.keys(matchData.players || {}).sort() : [];
  const oppUid = uids.find(u => u !== uid) || null;
  const isHost = uids.length === 2 && uids[0] === uid;

  const showToast = (msg) => {
    clearTimeout(toastTimer.current);
    setToast(msg);
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  };

  // 언마운트 정리
  useEffect(() => {
    return () => {
      clearTimeout(toastTimer.current);
      clearTimeout(matchTimer.current);
      queueUnsubRef.current?.();
      matchUnsubRef.current?.();
      umatchUnsubRef.current?.();
    };
  }, []);

  // 매치 구독
  useEffect(() => {
    matchUnsubRef.current?.();
    if (!matchId) { matchUnsubRef.current = null; return; }
    const unsub = subscribeMatch(matchId, data => setMatchData(data));
    matchUnsubRef.current = unsub;
    return unsub;
  }, [matchId]);

  // 매치 알림 구독 (상대가 매치 생성 시 수신)
  useEffect(() => {
    umatchUnsubRef.current?.();
    if (!uid) return;
    const unsub = subscribeUMatch(uid, (mid) => {
      if (mid && !matchId) {
        clearTimeout(matchTimer.current);
        queueUnsubRef.current?.();
        setMatchId(mid);
        setScreen('battle');
        clearUMatch(uid);
      }
    });
    umatchUnsubRef.current = unsub;
    return unsub;
  }, [uid, matchId]);

  // host: 양측 픽 완료 시 턴 해소
  useEffect(() => {
    if (!matchData || !isHost || resolvingRef.current) return;
    if (matchData.phase !== 'battle') return;
    const picks = matchData.picks || {};
    if (uids.length !== 2) return;
    const [u1, u2] = uids;
    if (!picks[u1] || !picks[u2]) return;
    resolvingRef.current = true;
    resolveTurn(matchData, picks[u1], picks[u2], u1, u2)
      .catch(console.error)
      .finally(() => { resolvingRef.current = false; });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchData?.picks, isHost, matchData?.phase]);

  // host: 교체 완료 시 전환
  useEffect(() => {
    if (!matchData || !isHost || resolvingRef.current) return;
    if (matchData.phase !== 'switch') return;
    const swNeeded = matchData.switchNeeded || {};
    const swChoice = matchData.switchChoice || {};
    const needers  = Object.keys(swNeeded).filter(u => swNeeded[u] === true);
    if (needers.length === 0) return;
    if (!needers.every(u => swChoice[u] !== undefined && swChoice[u] !== null)) return;
    resolvingRef.current = true;
    resolveSwitch(swChoice, swNeeded)
      .catch(console.error)
      .finally(() => { resolvingRef.current = false; });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchData?.switchChoice, isHost, matchData?.phase]);

  // 턴/페이즈 변경 시 내 픽 초기화
  useEffect(() => {
    if (matchData?.phase === 'battle') {
      setMyPick(null);
      setMySwitchChoice(null);
    }
  }, [matchData?.turn, matchData?.phase]);

  // 승패 화면 전환 + 보상
  useEffect(() => {
    if (matchData?.status !== 'finished') return;
    setScreen('finished');
    if (!rewardApplied && matchData.winner === uid && matchData.winner !== 'draw') {
      // TODO: 추후 확장 예정 (시즌 포인트, 전적 기록, 승률 통계 등)
      setGs(prev => ({ ...prev, tickets: prev.tickets + WIN_REWARD }));
      setRewardApplied(true);
      showToast(`승리! 도토리 +${WIN_REWARD}개`);
    }
  }, [matchData?.status, matchData?.winner]);

  // ── 매칭 ──
  const startMatching = async () => {
    if (!uid || deck.length === 0) { showToast('덱을 구성하세요'); return; }
    setScreen('matching');
    setMyPick(null);
    setMySwitchChoice(null);
    setRewardApplied(false);

    const deckData = deck.map(inst => ({
      id: inst.id,
      condition:    inst.condition    || 1,
      enhanceLevel: inst.enhanceLevel || 0,
      levelCount:   inst.levelCount   || 0,
      growth:       gs?.cardBonusDmg?.[inst.uid] || 0,
    }));

    await enterQueue(uid, { uid, name: nickname, deck: deckData, joinedAt: Date.now() });

    queueUnsubRef.current?.();
    const unsub = subscribeQueue(async (queue) => {
      const others = Object.values(queue).filter(e => e?.uid && e.uid !== uid);
      if (others.length === 0) return;

      const other = others[0];
      // uid가 낮은 쪽이 매치 생성 (중복 방지)
      if (uid >= other.uid) return;

      queueUnsubRef.current?.();

      const myEntry = queue[uid];
      if (!myEntry) return;

      const p1uid = uid, p2uid = other.uid;
      const p1Hps = toArr(myEntry.deck).map(d => PVP_HP[CARDS.find(c => c.id === d.id)?.grade] || 300);
      const p2Hps = toArr(other.deck).map(d => PVP_HP[CARDS.find(c => c.id === d.id)?.grade] || 300);

      const matchRef = await createPvpMatch({
        status: 'active',
        phase: 'battle',
        players: {
          [p1uid]: { name: myEntry.name, deck: myEntry.deck },
          [p2uid]: { name: other.name,   deck: other.deck   },
        },
        cardHps:      { [p1uid]: p1Hps, [p2uid]: p2Hps },
        activeIdx:    { [p1uid]: 0,     [p2uid]: 0      },
        turn: 1,
        picks: {},
        switchNeeded: null,
        switchChoice: null,
        battleLog: null,
        winner: null,
      });

      const mid = matchRef.key;
      await batchPvpUpdate({
        [`${PVP_USER_MATCH_PATH}/${p1uid}`]: mid,
        [`${PVP_USER_MATCH_PATH}/${p2uid}`]: mid,
        [`${PVP_QUEUE_PATH}/${p1uid}`]: null,
        [`${PVP_QUEUE_PATH}/${p2uid}`]: null,
      });

      clearTimeout(matchTimer.current);
      setMatchId(mid);
      setScreen('battle');
      clearUMatch(uid);
    });
    queueUnsubRef.current = unsub;

    matchTimer.current = setTimeout(() => {
      queueUnsubRef.current?.();
      leaveQueue(uid);
      setScreen('deck');
      showToast('상대를 찾지 못했습니다');
    }, MATCH_TIMEOUT);
  };

  const cancelMatching = () => {
    clearTimeout(matchTimer.current);
    queueUnsubRef.current?.();
    leaveQueue(uid);
    setScreen('deck');
  };

  // ── 턴 해소 (host 전용) ──
  const resolveTurn = async (data, p1Pick, p2Pick, uid1, uid2) => {
    const p1Deck = toArr(data.players[uid1]?.deck);
    const p2Deck = toArr(data.players[uid2]?.deck);
    const p1Idx  = data.activeIdx?.[uid1] || 0;
    const p2Idx  = data.activeIdx?.[uid2] || 0;
    const p1Inst = p1Deck[p1Idx];
    const p2Inst = p2Deck[p2Idx];
    const p1Card = CARDS.find(c => c.id === p1Inst?.id);
    const p2Card = CARDS.find(c => c.id === p2Inst?.id);
    if (!p1Card || !p2Card || !p1Inst || !p2Inst) return;

    const p1Atk = calcPvpDmg(p1Card.grade, p1Inst.condition, p1Inst.enhanceLevel, p1Inst.levelCount, p1Inst.growth);
    const p2Atk = calcPvpDmg(p2Card.grade, p2Inst.condition, p2Inst.enhanceLevel, p2Inst.levelCount, p2Inst.growth);

    let p1TakeDmg = 0, p2TakeDmg = 0;
    const log = [];

    // p1 → p2
    if (p1Pick === 'attack') {
      if (p2Pick === 'dodge') {
        if (Math.random() < 0.5) {
          log.push(`${p1Card.name} 공격 → ${p2Card.name} 회피 성공`);
        } else {
          p2TakeDmg = p1Atk;
          log.push(`${p1Card.name} 공격 → ${p2Card.name} 회피 실패! ${p1Atk} 데미지`);
        }
      } else if (p2Pick === 'defend') {
        p2TakeDmg = Math.max(0, Math.floor(p1Atk * 0.6));
        log.push(`${p1Card.name} 공격 → ${p2Card.name} 방어! ${p2TakeDmg} 데미지`);
      } else {
        p2TakeDmg = p1Atk;
        log.push(`${p1Card.name} 공격 ${p1Atk} 데미지`);
      }
    }
    // p2 → p1
    if (p2Pick === 'attack') {
      if (p1Pick === 'dodge') {
        if (Math.random() < 0.5) {
          log.push(`${p2Card.name} 공격 → ${p1Card.name} 회피 성공`);
        } else {
          p1TakeDmg = p2Atk;
          log.push(`${p2Card.name} 공격 → ${p1Card.name} 회피 실패! ${p2Atk} 데미지`);
        }
      } else if (p1Pick === 'defend') {
        p1TakeDmg = Math.max(0, Math.floor(p2Atk * 0.6));
        log.push(`${p2Card.name} 공격 → ${p1Card.name} 방어! ${p1TakeDmg} 데미지`);
      } else {
        p1TakeDmg = p2Atk;
        log.push(`${p2Card.name} 공격 ${p2Atk} 데미지`);
      }
    }
    if (log.length === 0) log.push('양측 무공격');

    // HP 갱신
    const p1Hps = toArr(data.cardHps?.[uid1]).map(Number);
    const p2Hps = toArr(data.cardHps?.[uid2]).map(Number);
    const p1MaxHp = PVP_HP[p1Card.grade] || 300;
    const p2MaxHp = PVP_HP[p2Card.grade] || 300;
    p1Hps[p1Idx] = Math.max(0, (isNaN(p1Hps[p1Idx]) ? p1MaxHp : p1Hps[p1Idx]) - p1TakeDmg);
    p2Hps[p2Idx] = Math.max(0, (isNaN(p2Hps[p2Idx]) ? p2MaxHp : p2Hps[p2Idx]) - p2TakeDmg);

    const p1Dead    = p1Hps[p1Idx] <= 0;
    const p2Dead    = p2Hps[p2Idx] <= 0;
    if (p1Dead) log.push(`${p1Card.name} KO!`);
    if (p2Dead) log.push(`${p2Card.name} KO!`);

    const p1AllDead = p1Hps.every(h => h <= 0);
    const p2AllDead = p2Hps.every(h => h <= 0);

    let winner    = null;
    let newPhase  = 'battle';
    let swNeeded  = null;

    if      (p1AllDead && p2AllDead) { winner = 'draw'; newPhase = 'finished'; }
    else if (p1AllDead)              { winner = uid2;   newPhase = 'finished'; }
    else if (p2AllDead)              { winner = uid1;   newPhase = 'finished'; }
    else if (p1Dead || p2Dead) {
      newPhase = 'switch';
      swNeeded = {};
      if (p1Dead) swNeeded[uid1] = true;
      if (p2Dead) swNeeded[uid2] = true;
    }

    const upd = {
      [`${PVP_MATCH_PATH}/${matchId}/cardHps/${uid1}`]: p1Hps,
      [`${PVP_MATCH_PATH}/${matchId}/cardHps/${uid2}`]: p2Hps,
      [`${PVP_MATCH_PATH}/${matchId}/picks/${uid1}`]:   null,
      [`${PVP_MATCH_PATH}/${matchId}/picks/${uid2}`]:   null,
      [`${PVP_MATCH_PATH}/${matchId}/turn`]:            (data.turn || 1) + 1,
      [`${PVP_MATCH_PATH}/${matchId}/battleLog`]:       { text: log.join(' / '), ts: Date.now() },
      [`${PVP_MATCH_PATH}/${matchId}/phase`]:           newPhase,
      [`${PVP_MATCH_PATH}/${matchId}/winner`]:          winner,
    };
    if (swNeeded) {
      upd[`${PVP_MATCH_PATH}/${matchId}/switchNeeded`] = swNeeded;
      upd[`${PVP_MATCH_PATH}/${matchId}/switchChoice`] = {};
    }
    if (newPhase === 'finished') {
      upd[`${PVP_MATCH_PATH}/${matchId}/status`] = 'finished';
    }
    await batchPvpUpdate(upd);
  };

  const resolveSwitch = async (choices, swNeeded) => {
    const upd = {
      [`${PVP_MATCH_PATH}/${matchId}/phase`]:        'battle',
      [`${PVP_MATCH_PATH}/${matchId}/switchNeeded`]: null,
      [`${PVP_MATCH_PATH}/${matchId}/switchChoice`]: null,
      [`${PVP_MATCH_PATH}/${matchId}/picks`]:        {},
    };
    for (const u of Object.keys(swNeeded)) {
      if (swNeeded[u] && choices[u] !== undefined) {
        upd[`${PVP_MATCH_PATH}/${matchId}/activeIdx/${u}`] = choices[u];
      }
    }
    await batchPvpUpdate(upd);
  };

  // ── 액션 ──
  const submitPick = async (pick) => {
    if (!matchId || !uid || myPick || matchData?.phase !== 'battle') return;
    setMyPick(pick);
    await submitPvpPick(matchId, uid, pick);
  };

  const submitSwitch = async (cardIdx) => {
    if (!matchId || !uid || mySwitchChoice !== null) return;
    setMySwitchChoice(cardIdx);
    await submitPvpSwitch(matchId, uid, cardIdx);
  };

  const quitMatch = () => {
    matchUnsubRef.current?.();
    setMatchId(null);
    setMatchData(null);
    setMyPick(null);
    setMySwitchChoice(null);
    setRewardApplied(false);
    setScreen('deck');
  };

  // ── 덱 빌더 헬퍼 ──
  const deckCost = deck.reduce((sum, inst) => {
    const c = CARDS.find(x => x.id === inst.id);
    return sum + (PVP_COST[c?.grade] || 0);
  }, 0);

  const toggleCard = (inst) => {
    const c    = CARDS.find(x => x.id === inst.id);
    if (!c) return;
    const cost  = PVP_COST[c.grade] || 0;
    const inDeck = deck.some(d => d.uid === inst.uid);
    if (inDeck) {
      setDeck(prev => prev.filter(d => d.uid !== inst.uid));
    } else {
      if (deck.length >= MAX_DECK)          { showToast(`최대 ${MAX_DECK}장`); return; }
      if (deckCost + cost > MAX_COST)       { showToast(`코스트 초과 (최대 ${MAX_COST})`); return; }
      setDeck(prev => [...prev, inst]);
    }
  };

  // ── 배틀 뷰 헬퍼 ──
  const myDeck    = matchData ? toArr(matchData.players?.[uid]?.deck)    : [];
  const oppDeck   = matchData ? toArr(matchData.players?.[oppUid]?.deck) : [];
  const myHps     = matchData ? toArr(matchData.cardHps?.[uid]).map(Number)    : [];
  const oppHps    = matchData ? toArr(matchData.cardHps?.[oppUid]).map(Number) : [];
  const myIdx     = matchData?.activeIdx?.[uid]    || 0;
  const oppIdx    = matchData?.activeIdx?.[oppUid] || 0;
  const myInst    = myDeck[myIdx];
  const oppInst   = oppDeck[oppIdx];
  const myCard    = myInst    ? CARDS.find(c => c.id === myInst.id)  : null;
  const oppCard   = oppInst   ? CARDS.find(c => c.id === oppInst.id) : null;
  const myHp      = isNaN(myHps[myIdx])  ? (PVP_HP[myCard?.grade] || 0)  : (myHps[myIdx]  ?? 0);
  const oppHp     = isNaN(oppHps[oppIdx]) ? (PVP_HP[oppCard?.grade] || 0) : (oppHps[oppIdx] ?? 0);
  const myMaxHp   = PVP_HP[myCard?.grade]  || 1;
  const oppMaxHp  = PVP_HP[oppCard?.grade] || 1;
  const oppName   = matchData?.players?.[oppUid]?.name || '상대';
  const phase     = matchData?.phase;
  const winner    = matchData?.winner;
  const myNeedsSwitch  = phase === 'switch' && matchData?.switchNeeded?.[uid]    === true;
  const oppNeedsSwitch = phase === 'switch' && matchData?.switchNeeded?.[oppUid] === true;
  const oppPicked = !!(matchData?.picks?.[oppUid]);

  // ── 화면: 덱 빌더 ──
  if (screen === 'deck') {
    const ownedCards = [...(gs?.ownedCards || [])].sort((a, b) => {
      const ca = CARDS.find(c => c.id === a.id);
      const cb = CARDS.find(c => c.id === b.id);
      return GRADE_SORT.indexOf(ca?.grade) - GRADE_SORT.indexOf(cb?.grade);
    });

    return (
      <div className="pvp-wrap">
        {toast && <div className="cw-toast">{toast}</div>}

        <div className="pvp-header-row">
          <div className="col-title">PvP 대전</div>
          <div className="pvp-header-sub">카드 최대 {MAX_DECK}장 · 코스트 합계 {MAX_COST} 이내</div>
        </div>

        {/* 덱 미리보기 */}
        <div className="pvp-deck-area">
          <div className="pvp-deck-label">
            내 덱 &nbsp;<span className="pvp-deck-stat">{deck.length}/{MAX_DECK}</span>
            &nbsp;|&nbsp; 코스트 <span className={`pvp-deck-stat${deckCost >= MAX_COST ? ' pvp-cost-max' : ''}`}>{deckCost}/{MAX_COST}</span>
          </div>
          <div className="pvp-deck-slots">
            {Array.from({ length: MAX_DECK }).map((_, i) => {
              const inst = deck[i];
              const c    = inst ? CARDS.find(x => x.id === inst.id) : null;
              return (
                <div
                  key={i}
                  className={`pvp-deck-slot${c ? ' filled' : ' empty'}`}
                  style={c ? { borderColor: GRADE_COLOR[c.grade], boxShadow: `0 0 6px ${GRADE_COLOR[c.grade]}44` } : {}}
                  onClick={() => c && toggleCard(inst)}
                >
                  {c ? (
                    <>
                      <img src={`/${c.img}`} alt={c.name} />
                      <span className="pvp-slot-cost" style={{ background: GRADE_COLOR[c.grade] }}>
                        {PVP_COST[c.grade]}
                      </span>
                    </>
                  ) : (
                    <span className="pvp-slot-plus">+</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <button
          className="pvp-match-btn"
          onClick={startMatching}
          disabled={isGuest || deck.length === 0}
        >
          {isGuest ? '로그인이 필요합니다' : deck.length === 0 ? '카드를 선택하세요' : '매칭 시작'}
        </button>

        {/* 카드 목록 */}
        <div className="pvp-card-list">
          {ownedCards.map(inst => {
            const c       = CARDS.find(x => x.id === inst.id);
            if (!c) return null;
            const cost    = PVP_COST[c.grade] || 0;
            const inDeck  = deck.some(d => d.uid === inst.uid);
            const tooFull = !inDeck && deck.length >= MAX_DECK;
            const overCost = !inDeck && deckCost + cost > MAX_COST;
            const blocked = tooFull || overCost;
            return (
              <div
                key={inst.uid}
                className={`pvp-card-item${inDeck ? ' in-deck' : blocked ? ' blocked' : ''}`}
                style={inDeck ? { borderColor: GRADE_COLOR[c.grade] } : {}}
                onClick={() => toggleCard(inst)}
              >
                <img src={`/${c.img}`} alt={c.name} className="pvp-card-thumb" />
                <div className="pvp-card-info">
                  <div className="pvp-card-name-row">
                    <span className="pvp-card-name">{c.name}</span>
                    <span className="pvp-grade-badge" style={{ background: GRADE_COLOR[c.grade] }}>
                      {GRADE_LABEL[c.grade]}
                    </span>
                  </div>
                  <div className="pvp-card-stats">
                    <span>코스트 {cost}</span>
                    <span>HP {(PVP_HP[c.grade] || 0).toLocaleString()}</span>
                    {(inst.condition || 1) > 1 && <span>컨디션 {inst.condition}</span>}
                    {(inst.enhanceLevel || 0) > 0 && <span>+{inst.enhanceLevel}강</span>}
                  </div>
                </div>
                {inDeck && <span className="pvp-in-deck">선택됨</span>}
              </div>
            );
          })}
          {ownedCards.length === 0 && (
            <div className="pvp-empty-msg">보유 카드가 없어요. 뽑기 탭에서 카드를 획득해보세요!</div>
          )}
        </div>
      </div>
    );
  }

  // ── 화면: 매칭 중 ──
  if (screen === 'matching') {
    return (
      <div className="pvp-wrap pvp-center-screen">
        {toast && <div className="cw-toast">{toast}</div>}
        <div className="pvp-spinner" />
        <div className="pvp-matching-text">상대를 찾는 중...</div>
        <div className="pvp-matching-sub">최대 1분간 대기합니다</div>
        <button className="pvp-cancel-btn" onClick={cancelMatching}>취소</button>
      </div>
    );
  }

  // ── 화면: 전투 ──
  if (screen === 'battle' && matchData) {
    const myAliveAlts = myDeck
      .map((d, i) => ({ d, i, hp: myHps[i] ?? PVP_HP[CARDS.find(c => c.id === d?.id)?.grade] ?? 300 }))
      .filter(({ i, hp }) => hp > 0 && i !== myIdx);

    const pickLabel = (p) => p === 'attack' ? '공격' : p === 'defend' ? '방어' : '회피';

    return (
      <div className="pvp-battle-wrap">
        {toast && <div className="cw-toast">{toast}</div>}

        {/* 상대 */}
        <div className="pvp-side pvp-side-opp">
          <div className="pvp-fighter-name">{oppName}</div>
          <div className="pvp-deck-pips">
            {oppDeck.map((d, i) => {
              const c  = CARDS.find(x => x.id === d?.id);
              const hp = isNaN(oppHps[i]) ? (PVP_HP[c?.grade] || 300) : (oppHps[i] ?? 0);
              return (
                <div
                  key={i}
                  className={`pvp-pip${hp <= 0 ? ' dead' : i === oppIdx ? ' active' : ''}`}
                  style={hp > 0 ? { background: GRADE_COLOR[c?.grade] } : {}}
                />
              );
            })}
            {oppNeedsSwitch && <span className="pvp-switch-hint">교체 중</span>}
            {oppPicked && !myPick && phase === 'battle' && <span className="pvp-opp-ready">선택 완료</span>}
          </div>
          {oppCard && (
            <div className={`pvp-active-card grade-${oppCard.grade}`}>
              <div className="card-header">
                <span className="card-name">{oppCard.name}</span>
                <span className="grade-badge">{GRADE_LABEL[oppCard.grade]}</span>
              </div>
              <div className="card-art">
                <img src={`/${oppCard.img}`} alt={oppCard.name} />
              </div>
              <div className="card-aurora" />
            </div>
          )}
          <div className="pvp-hp-wrap">
            <div className="pvp-hp-bar">
              <div
                className="pvp-hp-fill"
                style={{ width: `${Math.max(0, (oppHp / oppMaxHp) * 100)}%`, background: GRADE_COLOR[oppCard?.grade] }}
              />
            </div>
            <div className="pvp-hp-text">{oppHp.toLocaleString()} / {oppMaxHp.toLocaleString()}</div>
          </div>
        </div>

        {/* 로그 */}
        <div className="pvp-log-area">
          <div className="pvp-log-text">
            {matchData.battleLog?.text || '전투 시작!'}
          </div>
          <div className="pvp-turn-badge">Turn {matchData.turn || 1}</div>
        </div>

        {/* 내 카드 */}
        <div className="pvp-side pvp-side-me">
          <div className="pvp-hp-wrap">
            <div className="pvp-hp-bar">
              <div
                className="pvp-hp-fill"
                style={{ width: `${Math.max(0, (myHp / myMaxHp) * 100)}%`, background: GRADE_COLOR[myCard?.grade] }}
              />
            </div>
            <div className="pvp-hp-text">{myHp.toLocaleString()} / {myMaxHp.toLocaleString()}</div>
          </div>
          {myCard && (
            <div className={`pvp-active-card grade-${myCard.grade}`}>
              <div className="card-header">
                <span className="card-name">{myCard.name}</span>
                <span className="grade-badge">{GRADE_LABEL[myCard.grade]}</span>
              </div>
              <div className="card-art">
                <img src={`/${myCard.img}`} alt={myCard.name} />
              </div>
              <div className="card-aurora" />
            </div>
          )}
          <div className="pvp-deck-pips">
            {myDeck.map((d, i) => {
              const c  = CARDS.find(x => x.id === d?.id);
              const hp = isNaN(myHps[i]) ? (PVP_HP[c?.grade] || 300) : (myHps[i] ?? 0);
              return (
                <div
                  key={i}
                  className={`pvp-pip${hp <= 0 ? ' dead' : i === myIdx ? ' active' : ''}`}
                  style={hp > 0 ? { background: GRADE_COLOR[c?.grade] } : {}}
                />
              );
            })}
          </div>
          <div className="pvp-fighter-name pvp-my-name">{nickname} (나)</div>
        </div>

        {/* 액션 패널 */}
        <div className="pvp-action-panel">
          {/* 일반 픽 */}
          {phase === 'battle' && !myNeedsSwitch && (
            myPick ? (
              <div className="pvp-pick-done">
                <span>{pickLabel(myPick)} 선택 완료</span>
                {!oppPicked && <div className="pvp-wait-sub">상대 선택 대기 중...</div>}
              </div>
            ) : (
              <div className="pvp-pick-row">
                <button className="pvp-pick-btn pvp-btn-attack" onClick={() => submitPick('attack')}>공격</button>
                <button className="pvp-pick-btn pvp-btn-defend" onClick={() => submitPick('defend')}>방어</button>
                <button className="pvp-pick-btn pvp-btn-dodge"  onClick={() => submitPick('dodge')}>회피</button>
              </div>
            )
          )}

          {/* 카드 교체 */}
          {myNeedsSwitch && mySwitchChoice === null && (
            <div className="pvp-switch-panel">
              <div className="pvp-switch-title">카드를 교체하세요</div>
              <div className="pvp-switch-cards">
                {myAliveAlts.map(({ d, i, hp }) => {
                  const c = CARDS.find(x => x.id === d?.id);
                  if (!c) return null;
                  return (
                    <div key={i} className={`pvp-switch-opt grade-${c.grade}`} onClick={() => submitSwitch(i)}>
                      <img src={`/${c.img}`} alt={c.name} />
                      <div className="pvp-switch-opt-name">{c.name}</div>
                      <div className="pvp-switch-opt-hp">{hp.toLocaleString()} HP</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {myNeedsSwitch && mySwitchChoice !== null && (
            <div className="pvp-pick-done">교체 완료. 상대 대기 중...</div>
          )}
          {phase === 'switch' && !myNeedsSwitch && (
            <div className="pvp-pick-done">상대가 카드를 교체하는 중...</div>
          )}
        </div>

        <button className="pvp-quit-btn" onClick={quitMatch}>나가기</button>
      </div>
    );
  }

  // ── 화면: 결과 ──
  if (screen === 'finished') {
    const iWon  = winner === uid;
    const isDraw = winner === 'draw';
    return (
      <div className="pvp-wrap pvp-center-screen">
        {toast && <div className="cw-toast">{toast}</div>}
        <div className={`pvp-result-badge${iWon ? ' pvp-win' : isDraw ? ' pvp-draw' : ' pvp-lose'}`}>
          {iWon ? '승리!' : isDraw ? '무승부' : '패배'}
        </div>
        <div className="pvp-result-sub">
          {iWon ? `도토리 +${WIN_REWARD}개 획득!` : isDraw ? '팽팽한 접전이었어요!' : '다음엔 이겨봐요!'}
        </div>
        <button className="pvp-match-btn" style={{ marginTop: 20 }} onClick={quitMatch}>
          다시 하기
        </button>
      </div>
    );
  }

  return (
    <div className="pvp-wrap pvp-center-screen">
      <div className="pvp-spinner" />
    </div>
  );
}
