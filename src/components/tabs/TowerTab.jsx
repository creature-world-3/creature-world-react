import { useState, useEffect, useRef } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase/config.js';
import { CARDS, CHARACTERS } from '../../data/cards.js';
import {
  createRoom, joinRoom, leaveRoom,
  setPlayerCard as rtdbSetCard, setPlayerJob as rtdbSetJob, setPlayerReady,
  submitPick, writeBattle, setRoomStatus, markJobReady, markNextReady, markBetweenReady,
  sendChat,
  subscribeRoom, subscribeRooms,
} from '../../utils/towerMulti.js';

// ── 상수 ──
const JOB_BASE_STATS = {
  warrior:  { hp: 100, maxHp: 100, atk: 15, def: 5 },
  ironbody: { hp: 120, maxHp: 120, atk: 8,  def: 10 },
  rogue:    { hp: 110, maxHp: 110, atk: 14, def: 5 },
  mage:     { hp: 80,  maxHp: 80,  atk: 20, def: 2 },
  vampire:  { hp: 130, maxHp: 130, atk: 12, def: 5 },
};
const PLAYER_BASE = { hp: 100, maxHp: 100, atk: 15, def: 5 };
const EMPTY_BASIC_USED = { attack: false, defend: false, dodge: false };

const BASIC_CARDS = [
  { id: 'attack', name: '공격', desc: '내 공격력만큼 데미지',           type: 'basic', color: '#ef4444', img: '/tower/cards/공격카드.png' },
  { id: 'defend', name: '방어', desc: '이번 턴 받는 피해 방어력만큼 감소', type: 'basic', color: '#3b82f6', img: '/tower/cards/방어카드.png' },
  { id: 'dodge',  name: '회피', desc: '50% 확률로 이번 턴 적 공격 무효',  type: 'basic', color: '#6366f1', img: '/tower/cards/회피카드.png' },
];

const SKILL_CARDS = [
  // 공용
  { id: 'drain',        name: '흡혈',       desc: '공격 데미지의 50% 체력 회복',                  type: 'skill', job: null,       color: '#a855f7', img: '/tower/cards/흡혈카드.png' },
  { id: 'pierce',       name: '관통',       desc: '적 방어력 무시하고 공격',                      type: 'skill', job: null,       color: '#f43f5e', img: '/tower/cards/관통카드.png' },
  { id: 'charge',       name: '차지',       desc: '이번 턴 패스, 다음 공격 카드 2배 데미지',       type: 'skill', job: null,       color: '#06b6d4', img: '/tower/cards/차지카드.png' },
  { id: 'thorn',        name: '가시',       desc: '적이 공격하면 그 데미지만큼 반격',              type: 'skill', job: null,       color: '#84cc16', img: '/tower/cards/가시카드.png' },
  { id: 'taunt',        name: '도발',       desc: '이번 턴 적 공격 데미지 50% 감소',              type: 'skill', job: null,       color: '#f59e0b', img: '/tower/cards/도발카드.png' },
  { id: 'explode',      name: '폭발',       desc: '공격력 2배, 다음 턴 카드 사용 불가',           type: 'skill', job: null,       color: '#b91c1c', img: '/tower/cards/폭발카드.png' },
  // 전사
  { id: 'musado',       name: '무사도',     desc: '이번 턴 공격력 2배',                          type: 'skill', job: 'warrior',  color: '#ef4444', img: '/tower/cards/무사도.png' },
  { id: 'battlecry',    name: '전투함성',   desc: '다음 3턴 공격력 +20%',                        type: 'skill', job: 'warrior',  color: '#dc2626', img: '/tower/cards/전투함성.png' },
  { id: 'shieldsmash',  name: '방패치기',   desc: '방어하면서 적에게 공격력 50% 데미지',           type: 'skill', job: 'warrior',  color: '#f97316', img: '/tower/cards/방패치기.png' },
  { id: 'berserk',      name: '광폭화',     desc: '공격력 2배, 내 체력 25% 감소',                type: 'skill', job: 'warrior',  color: '#991b1b', img: '/tower/cards/광폭화.png' },
  // 금강불괴
  { id: 'goldenshield', name: '황금방패',   desc: '이번 턴 데미지 무효 + 방어력만큼 반격',         type: 'skill', job: 'ironbody', color: '#eab308', img: '/tower/cards/황금방패.png' },
  { id: 'ironclad',     name: '철갑',       desc: '다음 2턴 방어력 +50%',                        type: 'skill', job: 'ironbody', color: '#3b82f6', img: '/tower/cards/철갑.png' },
  { id: 'crush',        name: '분쇄',       desc: '적 방어력 영구 20% 감소',                     type: 'skill', job: 'ironbody', color: '#64748b', img: '/tower/cards/분쇄.png' },
  { id: 'earthforce',   name: '대지의힘',   desc: '방어력의 150%만큼 적에게 데미지',              type: 'skill', job: 'ironbody', color: '#78716c', img: '/tower/cards/대지의힘.png' },
  // 도적
  { id: 'vitals',       name: '급소',       desc: '공격력 1.5배 + 적 다음 공격력 30% 감소',       type: 'skill', job: 'rogue',    color: '#6366f1', img: '/tower/cards/급소.png' },
  { id: 'smokescreen',  name: '연막탄',     desc: '다음 턴 적 공격 100% 빗나감',                 type: 'skill', job: 'rogue',    color: '#94a3b8', img: '/tower/cards/연막탄.png' },
  { id: 'poison',       name: '독침',       desc: '3턴 동안 매 턴 공격력 20% 독 데미지',         type: 'skill', job: 'rogue',    color: '#4d7c0f', img: '/tower/cards/독침.png' },
  { id: 'kunai',        name: '쿠나이소나기', desc: '공격력 50%로 2~4회 랜덤 공격',               type: 'skill', job: 'rogue',    color: '#7c3aed', img: '/tower/cards/쿠나이소나기.png' },
  // 마법사
  { id: 'fireball',     name: '파이어볼',   desc: '공격력 2.5배, 내 체력 30% 감소',              type: 'skill', job: 'mage',     color: '#f97316', img: '/tower/cards/파이어볼.png' },
  { id: 'manashield',   name: '마나실드',   desc: '이번 턴 방어력 = 공격력의 80%',                type: 'skill', job: 'mage',     color: '#38bdf8', img: '/tower/cards/마나실드.png' },
  { id: 'lightning',    name: '번개',       desc: '적 최대체력의 20% 고정 데미지',               type: 'skill', job: 'mage',     color: '#a3e635', img: '/tower/cards/번개.png' },
  { id: 'magicabsorb',  name: '마력흡수',   desc: '공격 데미지의 70% 체력 회복',                 type: 'skill', job: 'mage',     color: '#7c3aed', img: '/tower/cards/마력흡수.png' },
  // 흡혈귀
  { id: 'bloodfeast',   name: '피의향연',   desc: '공격력 150% 데미지 + 데미지의 80% 체력 회복', type: 'skill', job: 'vampire',  color: '#dc2626', img: '/tower/cards/피의향연.png' },
  { id: 'batswarm',     name: '박쥐떼',     desc: '적 현재체력 15% 데미지 + 내 체력 10% 회복',  type: 'skill', job: 'vampire',  color: '#7c3aed', img: '/tower/cards/박쥐떼.png' },
  { id: 'curse',        name: '저주',       desc: '적 공격력 영구 10% 감소',                     type: 'skill', job: 'vampire',  color: '#4c1d95', img: '/tower/cards/저주.png' },
  { id: 'darkmantle',   name: '어둠의장막', desc: '이번 턴 회피 100% + 체력 8% 회복',            type: 'skill', job: 'vampire',  color: '#1e1b4b', img: '/tower/cards/어둠의장막.png' },
];

const ALL_CARDS = [...BASIC_CARDS, ...SKILL_CARDS];
const getCard = id => ALL_CARDS.find(c => c.id === id) || { id: 'pass', name: '—', desc: '', type: 'basic', color: '#888' };

const JOBS = [
  { id: 'warrior',  name: '전사',    img: '/tower/jobs/직업전사.png',    color: '#ef4444', desc: '공격 시 15% 크리티컬 1.5배, 스테이지 클리어마다 +1%' },
  { id: 'ironbody', name: '금강불괴', img: '/tower/jobs/직업금광불괴.png', color: '#3b82f6', desc: '방어 카드 사용 시 적에게 방어력만큼 데미지' },
  { id: 'rogue',    name: '도적',    img: '/tower/jobs/직업도적.png',    color: '#6366f1', desc: '회피 성공 시 다음 기본공격 +30% 공격력' },
  { id: 'mage',     name: '마법사',  img: '/tower/jobs/직업마법사.png',  color: '#a855f7', desc: '스킬 카드 최대 4장 보유 가능' },
  { id: 'vampire',  name: '흡혈귀',  img: '/tower/jobs/직업흡혈귀.png',  color: '#dc2626', desc: '적에게 데미지를 줄 때 데미지의 50% 체력 회복' },
];

const ATTACK_IDS = new Set([
  'attack',
  'drain', 'pierce', 'explode',
  'musado', 'berserk', 'shieldsmash',
  'earthforce',
  'vitals', 'kunai',
  'fireball', 'lightning', 'magicabsorb',
  'bloodfeast', 'batswarm',
]);
const isAttackCard = id => ATTACK_IDS.has(id);

const ALL_BOSS_SKILL_IDS = ['drain', 'pierce', 'charge', 'thorn', 'taunt', 'explode'];

const SHOP_ITEMS = [
  { id: 'potion',  name: '체력 포션',   desc: '체력 30% 즉시 회복',        price: 5,  icon: '🧪', once: false },
  { id: 'atk_buf', name: '공격력 버프', desc: '다음 층 공격력 1.5배',       price: 15, icon: '⚔️', once: true  },
  { id: 'def_buf', name: '방어력 버프', desc: '다음 층 방어력 1.5배',       price: 15, icon: '🛡️', once: true  },
  { id: 'hp_buf',  name: '체력 버프',   desc: '다음 층 최대 체력 1.5배',    price: 15, icon: '❤️', once: true  },
];

function getMonster(floor) {
  const isBoss = [5, 10, 15, 20, 25, 26].includes(floor);
  const tiers = isBoss ? 0 : Math.floor(floor / 5);
  const mult    = isBoss ? 2.5 : 1 + tiers * 0.3;
  const atkMult = isBoss ? 1.3 : 1 + tiers * 0.07;
  let name, img;
  if (floor <= 4)        { name = '허수아비';     img = '/tower/1-4.png'; }
  else if (floor === 5)  { name = '다크 토토리';   img = '/tower/5보스.png'; }
  else if (floor <= 9)   { name = '황소';          img = '/tower/6-9.png'; }
  else if (floor === 10) { name = '다크 핀초코';   img = '/tower/10보스.png'; }
  else if (floor <= 14)  { name = '두더지';        img = '/tower/11-14.png'; }
  else if (floor === 15) { name = '다크 루카뇽';   img = '/tower/15보스.png'; }
  else if (floor <= 19)  { name = '마법사 고양이'; img = '/tower/16-19.png'; }
  else if (floor === 20) { name = '다크 루미';     img = '/tower/20보스.png'; }
  else if (floor <= 24)  { name = '구름 고래';     img = '/tower/21-24.png'; }
  else if (floor === 25) { name = '다크 다이트론'; img = '/tower/25보스.png'; }
  else                   { name = '다크 미스티';   img = '/tower/레벨 ???.png'; }
  const hp  = Math.floor((30 + floor * 15) * mult);
  const atk = Math.floor((12 + floor * 4)  * atkMult);
  const def = Math.floor((floor * 2)        * mult);
  return { name, img, isBoss, hp, maxHp: hp, atk, def };
}

// 적도 플레이어와 같은 3장 순환 (보스는 스킬 카드 40% 확률 추가, 연속 같은 카드 방지)
function enemyPickCard(eBasicUsed, bossSkills, eBossSkillsUsed, lastPicked) {
  if (bossSkills && bossSkills.length > 0) {
    const available = bossSkills.filter(s => !eBossSkillsUsed?.[s]);
    if (available.length > 0 && Math.random() < 0.4) {
      return available[Math.floor(Math.random() * available.length)];
    }
  }
  let available = BASIC_CARDS.filter(c => !(eBasicUsed || {})[c.id]).map(c => c.id);
  if (!available.length) available = BASIC_CARDS.map(c => c.id);
  // 직전과 같은 카드 연속 방지 (대안이 있을 때만)
  const noRepeat = available.filter(id => id !== lastPicked);
  if (noRepeat.length > 0) available = noRepeat;
  return available[Math.floor(Math.random() * available.length)];
}

function pickSkillChoices(skills, job) {
  const owned = new Set(skills || []);
  const pool = SKILL_CARDS.filter(c => (c.job === null || c.job === job) && !owned.has(c.id));
  return pool.sort(() => Math.random() - 0.5).slice(0, 3);
}

const maxSkills = job => job === 'mage' ? 4 : 3;

function getTowerWeekKey() {
  const now = new Date(Date.now() + 9 * 3600 * 1000);
  const day = now.getUTCDay();
  const hour = now.getUTCHours();
  const monday = new Date(now);
  const diff = day === 0 ? -6 : 1 - day;
  monday.setUTCDate(monday.getUTCDate() + diff);
  if (day === 1 && hour < 9) monday.setUTCDate(monday.getUTCDate() - 7);
  return 'v2-' + monday.toISOString().slice(0, 10);
}

// ── 전투 계산 ──
function resolveTurn(pCard, eCard, run) {
  let pHp = run.player.hp,  pMaxHp = run.player.maxHp;
  let eHp = run.enemy.hp,   eMaxHp = run.enemy.maxHp;
  let pAtk = run.player.atk, pDef = run.player.def;
  let eAtk = run.enemy.atk,  eDef = run.enemy.def;

  const job = run.job || null;
  const log = [];

  let pCharge          = run.pCharge          || false;
  let eCharge          = run.eCharge          || false;
  let rogueReady       = run.rogueReady       || false;
  let pBattlecryTurns  = run.pBattlecryTurns  || 0;
  let pIroncladTurns   = run.pIroncladTurns   || 0;
  let smokescreenActive = run.pSmokescreenNext || false;
  let ePoisonTurns     = run.ePoisonTurns     || 0;
  let ePermDefMult     = run.ePermDefMult     != null ? run.ePermDefMult : 1.0;
  let ePermAtkMult     = run.ePermAtkMult     != null ? run.ePermAtkMult : 1.0;
  let eAtkNextDebuff   = run.eAtkNextDebuff   || 0;

  let pStunnedNext = false;
  let eStunnedNext = false;
  let playerDodged = false;

  const realPCard = run.pStunned ? 'pass' : pCard;
  const realECard = run.eStunned ? 'pass' : eCard;

  // 영구 디버프
  eDef  = Math.floor(eDef  * ePermDefMult);
  eAtk  = Math.floor(eAtk  * ePermAtkMult);

  // 버프 틱
  if (pBattlecryTurns > 0) { pAtk = Math.floor(pAtk * 1.2); pBattlecryTurns--; log.push(`전투함성: 공격력 +20% (${pBattlecryTurns}턴 남음)`); }
  if (pIroncladTurns  > 0) { pDef = Math.floor(pDef * 1.5); pIroncladTurns--;  }

  if (pCharge && isAttackCard(realPCard) && realPCard !== 'charge') { pAtk *= 2; pCharge = false; }
  if (eCharge && isAttackCard(realECard) && realECard !== 'charge') { eAtk *= 2; eCharge = false; }

  if (eAtkNextDebuff > 0) { eAtk = Math.floor(eAtk * (1 - eAtkNextDebuff)); eAtkNextDebuff = 0; }
  if (rogueReady && realPCard === 'attack') { pAtk = Math.floor(pAtk * 1.3); rogueReady = false; log.push(`도적 기회: 공격력 +30%`); }

  let playerDmg  = 0, enemyDmg  = 0, playerHeal = 0, enemyHeal = 0;
  let pBattlecryNext  = pBattlecryTurns;
  let pIroncladNext   = pIroncladTurns;
  let smokescreenNext = false;
  let ePoisonNext     = ePoisonTurns > 0 ? ePoisonTurns - 1 : 0;
  let ePermDefNext    = ePermDefMult;
  let ePermAtkNext    = ePermAtkMult;
  let eAtkDebuffNext  = 0;
  let pManashieldDef  = 0;
  let pGoldenShield   = false;
  let pThornActive    = false;
  let eThornActive    = false;
  let eThornReflect   = false;
  let multiHits       = null; // 다단 공격 시 히트별 데미지 배열

  // ── 플레이어 카드 ──
  switch (realPCard) {
    case 'attack':
      playerDmg = pAtk; log.push(`공격: ${pAtk} 데미지`); break;
    case 'defend':
      log.push(`방어: 이번 턴 ${pDef} 피해 감소`); break;
    case 'dodge':
      playerDodged = Math.random() < 0.5;
      if (playerDodged) { log.push(`회피 성공!`); if (job === 'rogue') { rogueReady = true; log.push(`도적: 다음 공격 +30%`); } }
      else { log.push(`회피 실패`); }
      break;
    // 공용
    case 'drain':
      playerDmg = pAtk; playerHeal = Math.floor(pAtk * 0.5);
      log.push(`흡혈: ${pAtk} 데미지, +${Math.floor(pAtk * 0.5)} 흡수`); break;
    case 'pierce':
      playerDmg = pAtk; log.push(`관통: ${pAtk} 데미지 (방어 무시)`); break;
    case 'charge':
      pCharge = true; log.push(`차지: 다음 공격 2배`); break;
    case 'thorn':
      pThornActive = true; log.push(`가시: 반격 대기`); break;
    case 'taunt':
      eAtk = Math.floor(eAtk * 0.5); log.push(`도발: 적 공격력 50% 감소`); break;
    case 'explode':
      playerDmg = pAtk * 2; pStunnedNext = true;
      log.push(`폭발: ${pAtk * 2} 데미지, 다음 턴 행동 불가`); break;
    // 전사
    case 'musado':
      playerDmg = pAtk * 2; log.push(`무사도: ${pAtk * 2} 데미지`); break;
    case 'battlecry':
      pBattlecryNext = 3; log.push(`전투함성: 다음 3턴 공격력 +20%`); break;
    case 'shieldsmash':
      playerDmg = Math.floor(pAtk * 0.5); log.push(`방패치기: 방어 + ${Math.floor(pAtk * 0.5)} 데미지`); break;
    case 'berserk': {
      const bc = Math.floor(pMaxHp * 0.25);
      pHp = Math.max(1, pHp - bc); playerDmg = pAtk * 2;
      log.push(`광폭화: 체력 -${bc}, ${pAtk * 2} 데미지`); break;
    }
    // 금강불괴
    case 'goldenshield':
      pGoldenShield = true; log.push(`황금방패: 피해 무효 + 방어력 반격 대기`); break;
    case 'ironclad':
      pIroncladNext = 2; log.push(`철갑: 다음 2턴 방어력 +50%`); break;
    case 'crush':
      ePermDefNext = Math.max(0, ePermDefMult * 0.8); log.push(`분쇄: 적 방어력 영구 20% 감소`); break;
    case 'earthforce':
      playerDmg = Math.floor(pDef * 1.5); log.push(`대지의힘: ${Math.floor(pDef * 1.5)} 데미지`); break;
    // 도적
    case 'vitals':
      playerDmg = Math.floor(pAtk * 1.5); eAtkDebuffNext = 0.3;
      log.push(`급소: ${Math.floor(pAtk * 1.5)} 데미지, 적 다음 공격 -30%`); break;
    case 'smokescreen':
      smokescreenNext = true; log.push(`연막탄: 다음 턴 적 공격 빗나감`); break;
    case 'poison':
      ePoisonNext = 3; log.push(`독침: 3턴 독 부여`); break;
    case 'kunai': {
      const hits = 2 + Math.floor(Math.random() * 3);
      const perHit = Math.floor(pAtk * 0.5);
      playerDmg = perHit * hits;
      multiHits = Array(hits).fill(perHit);
      log.push(`쿠나이소나기: ${hits}회 공격, ${playerDmg} 데미지`); break;
    }
    // 마법사
    case 'fireball': {
      const fc = Math.floor(pMaxHp * 0.3);
      pHp = Math.max(1, pHp - fc); playerDmg = Math.floor(pAtk * 2.5);
      log.push(`파이어볼: 체력 -${fc}, ${Math.floor(pAtk * 2.5)} 데미지`); break;
    }
    case 'manashield':
      pManashieldDef = Math.floor(pAtk * 0.8); log.push(`마나실드: 방어력 +${pManashieldDef}`); break;
    case 'lightning':
      playerDmg = Math.floor(eMaxHp * 0.2); log.push(`번개: ${Math.floor(eMaxHp * 0.2)} 고정 데미지`); break;
    case 'magicabsorb':
      playerDmg = pAtk; playerHeal = Math.floor(pAtk * 0.7);
      log.push(`마력흡수: ${pAtk} 데미지, +${Math.floor(pAtk * 0.7)} 흡수`); break;
    // 흡혈귀
    case 'bloodfeast': {
      playerDmg = Math.floor(pAtk * 1.5); playerHeal = Math.floor(playerDmg * 0.8);
      log.push(`피의향연: ${playerDmg} 데미지, +${playerHeal} 흡수`); break;
    }
    case 'batswarm':
      playerDmg = Math.floor(eHp * 0.15); playerHeal = Math.floor(pMaxHp * 0.1);
      log.push(`박쥐떼: ${Math.floor(eHp * 0.15)} 데미지, +${Math.floor(pMaxHp * 0.1)} 회복`); break;
    case 'curse':
      ePermAtkNext = Math.max(0, ePermAtkMult * 0.9); log.push(`저주: 적 공격력 영구 10% 감소`); break;
    case 'darkmantle':
      playerDodged = true; playerHeal = Math.floor(pMaxHp * 0.08);
      log.push(`어둠의장막: 완전 회피 + 체력 +${Math.floor(pMaxHp * 0.08)} 회복`); break;
    default:
      if (run.pStunned) log.push(`기절: 이번 턴 행동 불가`); break;
  }

  // ── 적 카드 ──
  switch (realECard) {
    case 'attack':  enemyDmg = eAtk; break;
    case 'defend':  break;
    case 'dodge': {
      const edodge = Math.random() < 0.5;
      if (edodge) { playerDmg = 0; log.push(`적 회피 성공`); } else { log.push(`적 회피 실패`); }
      break;
    }
    case 'drain':   enemyDmg = eAtk; enemyHeal = Math.floor(eAtk * 0.5); log.push(`적 흡혈 공격`); break;
    case 'pierce':  enemyDmg = eAtk; log.push(`적 관통 공격`); break;
    case 'charge':  eCharge = true; log.push(`적 차지`); break;
    case 'thorn':   eThornActive = true; break;
    case 'taunt':   pAtk = Math.floor(pAtk * 0.5); log.push(`적 도발: 내 공격력 50% 감소`); break;
    case 'explode': enemyDmg = eAtk * 2; eStunnedNext = true; log.push(`적 폭발!`); break;
    default: break;
  }

  // ── 금강불괴 패시브: 방어 카드 사용 시 적에게 방어력만큼 데미지 ──
  if (job === 'ironbody' && realPCard === 'defend') {
    playerDmg += effectivePDef; log.push(`금강불괴: ${effectivePDef} 반격 데미지`);
  }

  // ── 방어 적용 ──
  const effectivePDef = pDef + pManashieldDef;
  if (realPCard === 'defend' || realPCard === 'shieldsmash') enemyDmg = Math.max(0, enemyDmg - effectivePDef);
  else if (pManashieldDef > 0) enemyDmg = Math.max(0, enemyDmg - pManashieldDef);
  if (realECard === 'defend' && realPCard !== 'pierce') playerDmg = Math.max(0, playerDmg - eDef);

  // ── 회피 ──
  if (playerDodged) enemyDmg = 0;

  // ── 연막탄 ──
  if (smokescreenActive) { enemyDmg = 0; log.push(`연막탄: 적 공격 빗나감`); }

  // ── 가시 반격 ──
  if (pThornActive && isAttackCard(realECard)) {
    const reflect = enemyDmg;
    playerDmg += reflect; enemyDmg = 0;
    log.push(`가시 반격: ${reflect} 데미지`);
  }

  // ── 황금방패 ──
  if (pGoldenShield) {
    if (enemyDmg > 0 || isAttackCard(realECard)) { playerDmg += pDef; log.push(`황금방패: 피해 무효 + ${pDef} 반격`); }
    enemyDmg = 0;
  }

  // ── 적 가시 반격 ──
  if (eThornActive && isAttackCard(realPCard)) {
    eThornReflect = true;
    const eReflect = playerDmg;
    enemyDmg += eReflect; playerDmg = 0;
    log.push(`적 가시 반격: ${eReflect} 데미지`);
  }

  // ── 독 데미지 ──
  if (ePoisonTurns > 0) {
    const poisonDmg = Math.floor(run.player.atk * 0.2);
    eHp = Math.max(0, eHp - poisonDmg);
    log.push(`독: ${poisonDmg} 독 데미지 (${ePoisonNext}턴 남음)`);
  }

  // 흡혈/마력흡수/피의향연: 데미지 0이면 회복 없음
  if ((realPCard === 'drain' || realPCard === 'magicabsorb') && playerDmg === 0) playerHeal = 0;
  if (realPCard === 'bloodfeast' && playerDmg === 0) playerHeal = 0;
  if (realECard === 'drain' && enemyDmg === 0) enemyHeal = 0;

  // ── 직업 패시브 ──
  if (job === 'warrior' && playerDmg > 0 && Math.random() < (0.15 + (run.critBonus || 0))) {
    const crit = Math.floor(playerDmg * 0.5);
    playerDmg += crit; log.push(`크리티컬! +${crit}`);
  }
  if (job === 'vampire' && playerDmg > 0) {
    const vHeal = Math.floor(playerDmg * 0.5);
    playerHeal += vHeal; log.push(`흡혈귀: +${vHeal} 회복`);
  }

  const finalPlayerHeal = playerHeal;
  const finalEnemyDmg   = enemyDmg;

  eHp = Math.max(0, eHp - playerDmg);
  if (eHp > 0) eHp = Math.min(eMaxHp, eHp + enemyHeal);
  pHp = Math.max(0, pHp - enemyDmg);
  if (pHp > 0) pHp = Math.min(pMaxHp, pHp + playerHeal);

  if (enemyDmg > 0 && !eThornReflect) log.push(`적 공격: ${enemyDmg} 피해`);
  if (enemyHeal > 0 && eHp > 0) log.push(`적 회복: +${enemyHeal}`);

  return {
    pHp, pMaxHp, eHp, eMaxHp,
    pCharge, eCharge,
    eTauntDebuff: false, pTauntDebuff: false,
    pStunnedNext, eStunnedNext,
    rogueReady,
    pBattlecryTurns: pBattlecryNext,
    pIroncladTurns:  pIroncladNext,
    pSmokescreenNext: smokescreenNext,
    ePoisonTurns:    ePoisonNext,
    ePermDefMult:    ePermDefNext,
    ePermAtkMult:    ePermAtkNext,
    eAtkNextDebuff:  eAtkDebuffNext,
    finalPlayerHeal,
    finalEnemyDmg,
    multiHits,
    log,
  };
}

// ── 멀티플레이 헬퍼 ──
const CHAR_ALT = { toto: 'totori', pin: 'pinchoco', luka: 'lukanyong' };
function cardBelongsToChar(cardId, charId) {
  if (charId === 'other') return !CHARACTERS.some(c => cardBelongsToChar(cardId, c.id));
  if (cardId.startsWith(charId + '_')) return true;
  const alt = CHAR_ALT[charId];
  if (alt && cardId.startsWith(alt + '_')) return true;
  const wc = alt || charId;
  return cardId === 'worldcup_' + wc || (alt && cardId === 'worldcup_' + charId);
}

function updateBasicUsed(current, cardId) {
  if (!BASIC_CARDS.some(c => c.id === cardId)) return current;
  const next = { ...current, [cardId]: true };
  return BASIC_CARDS.every(c => next[c.id]) ? { ...EMPTY_BASIC_USED } : next;
}

function getMonsterMulti(floor, count) {
  const m = getMonster(floor);
  return { ...m, hp: m.hp * count, maxHp: m.maxHp * count, atk: m.atk, def: m.def * count };
}

function resolveMultiTurn(battleState, picks, players) {
  const enemy = battleState.enemy;
  const playerStates = battleState.playerStates || {};

  // 슬롯 순서대로 살아있는 플레이어 정렬
  const aliveUids = Object.keys(playerStates)
    .filter(uid => (playerStates[uid]?.hp ?? 0) > 0)
    .sort((a, b) => (players[a]?.slot || 0) - (players[b]?.slot || 0));
  if (!aliveUids.length) return null;

  const logs = [];
  const newPlayerStates = {};
  let totalDmgToEnemy = 0;
  const dmgToEnemyPerPlayer = {};
  let runningEnemyHp = enemy.hp; // 누적 적 HP 추적 (먼저 처치 시 이후 플레이어 스킵)

  // 적 카드 순환 상태 (플레이어마다 각자 다른 카드 뽑음)
  let eBasicUsed    = { ...enemy.eBasicUsed };
  let eBossSkillsUsed = { ...(enemy.eBossSkillsUsed || {}) };
  let eCharge       = enemy.eCharge || false;
  let eTauntDebuff  = enemy.eTauntDebuff || false;
  let lastPicked    = enemy.lastPicked;
  let eStunnedNext  = false;
  const eCardsPerPlayer = {}; // 각 플레이어별 적 카드 기록

  for (const uid of aliveUids) {
    const ps = playerStates[uid] || {};

    // 이미 앞 플레이어가 적을 처치한 경우 → 이 플레이어는 전투 없이 상태 유지
    if (runningEnemyHp <= 0) {
      eCardsPerPlayer[uid] = 'pass';
      dmgToEnemyPerPlayer[uid] = 0;
      newPlayerStates[uid] = { ...ps, lunge: false };
      continue;
    }

    const pCard = picks[uid] || 'pass';

    // 이 플레이어와 싸울 적 카드 선택 (각자 다름)
    const eCard = enemyPickCard(eBasicUsed, enemy.bossSkills, eBossSkillsUsed, lastPicked);
    eCardsPerPlayer[uid] = eCard;

    // 적 카드 사용 기록 갱신
    const ePickIsBoss = !!(enemy.bossSkills?.includes(eCard));
    if (!ePickIsBoss) {
      const rawEBU = { ...eBasicUsed, [eCard]: true };
      eBasicUsed = BASIC_CARDS.every(c => rawEBU[c.id]) ? { ...EMPTY_BASIC_USED } : rawEBU;
    } else {
      eBossSkillsUsed = { ...eBossSkillsUsed, [eCard]: true };
    }
    lastPicked = eCard;

    // 1v1 전투 계산
    const fakeRun = {
      player: { hp: ps.hp, maxHp: ps.maxHp, atk: ps.atk, def: ps.def },
      enemy:  { ...enemy, hp: 999999, maxHp: 999999 },
      job: ps.job || null,
      critBonus: ps.critBonus || 0,
      rogueReady: ps.rogueReady || false,
      pCharge: ps.pCharge || false,
      eCharge,
      eTauntDebuff,
      pTauntDebuff: ps.pTauntDebuff || false,
      pStunned: ps.pStunned || false,
      eStunned: enemy.eStunned || false,
      pBattlecryTurns: ps.pBattlecryTurns || 0,
      pIroncladTurns:  ps.pIroncladTurns  || 0,
      pSmokescreenNext: ps.pSmokescreenNext || false,
      ePoisonTurns:    ps.ePoisonTurns    || 0,
      ePermDefMult:    ps.ePermDefMult    != null ? ps.ePermDefMult : 1.0,
      ePermAtkMult:    ps.ePermAtkMult    != null ? ps.ePermAtkMult : 1.0,
      eAtkNextDebuff:  ps.eAtkNextDebuff  || 0,
    };

    const r = resolveTurn(pCard, eCard, fakeRun);
    const dmgDealt = Math.min(Math.max(0, 999999 - r.eHp), runningEnemyHp);
    totalDmgToEnemy += dmgDealt;
    dmgToEnemyPerPlayer[uid] = dmgDealt;
    runningEnemyHp = Math.max(0, runningEnemyHp - dmgDealt);

    // 적 차지/도발 상태를 다음 플레이어 전투로 이어받음
    eCharge      = r.eCharge;
    eTauntDebuff = r.eTauntDebuff;
    if (r.eStunnedNext) eStunnedNext = true;

    newPlayerStates[uid] = {
      ...ps,
      hp: Math.max(0, r.pHp), maxHp: r.pMaxHp,
      pCharge: r.pCharge, rogueReady: r.rogueReady,
      pStunned: r.pStunnedNext, pTauntDebuff: false,
      pBattlecryTurns:  r.pBattlecryTurns,
      pIroncladTurns:   r.pIroncladTurns,
      pSmokescreenNext: r.pSmokescreenNext,
      ePoisonTurns:     r.ePoisonTurns,
      ePermDefMult:     r.ePermDefMult,
      ePermAtkMult:     r.ePermAtkMult,
      eAtkNextDebuff:   r.eAtkNextDebuff,
      basicUsed: updateBasicUsed(ps.basicUsed || {}, pCard),
      skillsUsed: (ps.skills || []).includes(pCard) ? { ...(ps.skillsUsed || {}), [pCard]: true } : (ps.skillsUsed || {}),
      lunge: dmgDealt > 0,
    };

    const pname = players[uid]?.name || '플레이어';
    r.log.forEach(l => logs.push(`[${pname}] ${l}`));
  }

  const newEnemyHp = Math.max(0, enemy.hp - totalDmgToEnemy);
  if (totalDmgToEnemy > 0) logs.push(`[팀] 총 ${totalDmgToEnemy} 데미지`);

  return {
    newEnemy: {
      ...enemy, hp: newEnemyHp,
      eBasicUsed, eBossSkillsUsed,
      eCharge, eTauntDebuff,
      eStunned: eStunnedNext,
      lastPicked,
    },
    newPlayerStates,
    targetUid: null,
    eCard: eCardsPerPlayer[aliveUids[0]] || null,
    eCardsPerPlayer,
    dmgToEnemyPerPlayer,
    logs,
  };
}

// ── 컴포넌트 ──
export default function TowerTab({ gs, setGs, user, isGuest }) {
  const [screen, setScreen]           = useState('intro');
  const [run, setRun]                 = useState(null);
  const [toast, setToast]             = useState(null);
const [statDraft, setStatDraft]     = useState({ hp: 0, atk: 0, def: 0 });
  const [cardFlipped, setCardFlipped] = useState(false);
  const [pickedId, setPickedId]       = useState(null);
  const [pFloat, setPFloat]           = useState(null);
  const [eFloat, setEFloat]           = useState(null);
  const [pShake, setPShake]           = useState(false);
  const [eShake, setEShake]           = useState(false);
  const [pLunge, setPLunge]           = useState(false);
  const [dragging, setDragging]       = useState(null); // { id, source, x, y }
  const [previewCard, setPreviewCard] = useState(null); // { id, source }
  const [bossWarning, setBossWarning] = useState(false);
  const bossWarnRef = useRef(null);       // 타이머
  const bossWarnedFloorRef = useRef(-1);  // 이미 경고 표시한 층 (멀티)
  const [pendingNewSkill, setPendingNewSkill] = useState(null);
  const [skillSlideIdx, setSkillSlideIdx] = useState(0);
  const [skillSlideDir, setSkillSlideDir] = useState('right');
  const [skillSlideKey, setSkillSlideKey] = useState(0);
  const [pendingCardInst, setPendingCardInst] = useState(null);
  const [jobSlideIdx, setJobSlideIdx] = useState(0);
  const [jobSlideDir, setJobSlideDir] = useState('right');
  const [jobSlideKey, setJobSlideKey] = useState(0);

  // 카드 선택 (단일/멀티 공용 슬라이더)
  const [selCharIdx, setSelCharIdx]     = useState(0);
  const [selCardIdx, setSelCardIdx]     = useState(0);
  const [selCardSlideDir, setSelCardSlideDir] = useState('right');
  const [selCardSlideKey, setSelCardSlideKey] = useState(0);
  const [cardSelectCtx, setCardSelectCtx] = useState('single'); // 'single'|'multi'

  // 멀티플레이
  const [multiScreen, setMultiScreen]   = useState(null); // 'list'|'lobby'|'battle'
  const [roomId, setRoomId]             = useState(null);
  const [roomData, setRoomData]         = useState(null);
  const [roomList, setRoomList]         = useState(null);
  const [newRoomTitle, setNewRoomTitle] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [lobbyPickPhase, setLobbyPickPhase] = useState(null); // null | 'card' | 'job'
  // 멀티 전투 로컬
  const [multiPicked, setMultiPicked]     = useState(null); // 내가 고른 카드
  const [multiEFloat, setMultiEFloat]     = useState(null);
  const [multiPFloats, setMultiPFloats]   = useState({}); // {uid: {val,type,k}}
  const [multiEShake, setMultiEShake]     = useState(false);
  const [multiPShakes, setMultiPShakes]   = useState({}); // {uid: bool}
  const [multiNextClicked, setMultiNextClicked] = useState(false);
  const [multiLunges, setMultiLunges]     = useState({}); // {uid: bool}
  const [logRevealIdx, setLogRevealIdx]   = useState(0);
  const [fightStep, setFightStep]         = useState(-1); // -1=시작전, 0~N=현재전투, -2=완료
  const [fightStepFlipped, setFightStepFlipped] = useState(false);
  const fightSeqTimersRef = useRef([]);
  // 멀티 사이 화면
  const [multiBetweenScreen, setMultiBetweenScreen] = useState(null); // 'stat'|'skill'|'shop'
  const [multiBetweenRun, setMultiBetweenRun]       = useState(null);
  const [multiBetweenStatDraft, setMultiBetweenStatDraft] = useState({ hp:0,atk:0,def:0 });
  const [multiBetweenPendingSkill, setMultiBetweenPendingSkill] = useState(null);
  const [multiBetweenSkillIdx, setMultiBetweenSkillIdx] = useState(0);
  const [multiBetweenSkillDir, setMultiBetweenSkillDir] = useState('right');
  const [multiBetweenSkillKey, setMultiBetweenSkillKey] = useState(0);
  const multiEFloatRef  = useRef(null);
  const multiPFloatRefs = useRef({});
  const prevPickStateRef = useRef(null);
  const rejoinPendingRef = useRef(false);

  // 재참여 (탭 전환 등으로 끊겼을 때)
  const [rejoinRoomId, setRejoinRoomId] = useState(() => sessionStorage.getItem('tw_roomId') || null);

  // 멀티 팀원 스탯 모달
  const [viewingPlayerUid, setViewingPlayerUid] = useState(null);

  // 멀티 채팅
  const [chatBubbles, setChatBubbles]   = useState({}); // { uid: msg }
  const [showChatInput, setShowChatInput] = useState(false);
  const [chatInput, setChatInput]       = useState('');
  const chatTimersRef  = useRef({});
  const lastChatTsRef  = useRef({});

  const toastRef   = useRef(null);
  const floatPRef  = useRef(null);
  const floatERef  = useRef(null);
  const loungeRef  = useRef(null);

  const weekKey = getTowerWeekKey();
  const myBest  = gs?.towerBest?.weekKey === weekKey ? (gs.towerBest.floor || 0) : 0;

  const showToast = msg => {
    clearTimeout(toastRef.current);
    setToast(msg);
    toastRef.current = setTimeout(() => setToast(null), 2500);
  };

  // ── 방 목록 구독 ──
  useEffect(() => {
    if (screen !== 'multi_list') return;
    const unsub = subscribeRooms(data => setRoomList(data), err => showToast('방 목록 오류: ' + err.message));
    return unsub;
  }, [screen]);

  // ── 방 구독 (데이터 수신만) ──
  useEffect(() => {
    if (!roomId) return;
    let isFirst = true;
    const unsub = subscribeRoom(roomId, data => {
      if (!data) {
        sessionStorage.removeItem('tw_roomId');
        setRoomId(null); setRoomData(null); setScreen('multi_list'); return;
      }
      setRoomData(data);
      // 재참여 첫 수신 시 화면 복원
      if (isFirst && rejoinPendingRef.current) {
        isFirst = false;
        rejoinPendingRef.current = false;
        const myUid = user?.uid;
        if (!myUid || !data.players?.[myUid]) {
          sessionStorage.removeItem('tw_roomId');
          setRoomId(null); showToast('방 정보를 찾을 수 없습니다'); setScreen('multi_list'); return;
        }
        if (data.status === 'battle' && data.battle) setScreen('multi_battle');
        else if (data.status === 'job_select') setScreen('multi_job_pick');
        else setScreen('multi_lobby');
      } else {
        isFirst = false;
      }
    }, err => showToast('연결 오류: ' + err.message));
    return unsub;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  // ── 멀티 진행 중 sessionStorage 저장/삭제 ──
  useEffect(() => {
    if (roomId && (screen === 'multi_battle' || screen === 'multi_lobby' || screen === 'multi_job_pick' || screen === 'multi_job_select')) {
      sessionStorage.setItem('tw_roomId', roomId);
    }
  }, [roomId, screen]);

  // ── 호스트 전용: 게임 진행 처리 ──
  const hostResolvingRef = useRef(false);
  useEffect(() => {
    if (!roomData || !roomId) return;
    if (roomData.hostUid !== user?.uid) return;
    if (hostResolvingRef.current) return;

    const battle = roomData.battle;

    // 직업 선택 완료 → 전투 시작
    if (roomData.status === 'job_select') {
      const allUids = Object.keys(roomData.players || {});
      const jobReady = roomData.jobReady || {};
      if (allUids.length > 0 && allUids.every(uid => jobReady[uid])) {
        hostResolvingRef.current = true;
        const players = roomData.players || {};
        const sortedUids = Object.entries(players).sort(([,a],[,b]) => a.slot - b.slot).map(([uid]) => uid);
        const count = sortedUids.length;
        const enemy = getMonsterMulti(1, count);
        const picks = {}; const playerStates = {};
        sortedUids.forEach(uid => {
          picks[uid] = null;
          const jobId = players[uid]?.job || null;
          const base = JOB_BASE_STATS[jobId] || PLAYER_BASE;
          playerStates[uid] = { ...base, skills: [], skillsUsed: {}, basicUsed: { ...EMPTY_BASIC_USED }, pCharge: false, pStunned: false, rogueReady: false, pTauntDebuff: false, gold: 0, pendingBuffs: {}, preBuffStats: null, job: jobId, maxFloor: 0, lunge: false, alive: true, critBonus: 0, pBattlecryTurns: 0, pIroncladTurns: 0, pSmokescreenNext: false, ePoisonTurns: 0, ePermDefMult: 1.0, ePermAtkMult: 1.0, eAtkNextDebuff: 0 };
        });
        const bossSkills = [];
        writeBattle(roomId, {
          floor: 1, maxFloor: 0, phase: 'pick',
          enemy: { ...enemy, eBasicUsed: { ...EMPTY_BASIC_USED }, eBossSkillsUsed: {}, bossSkills, eCharge: false, eStunned: false, eTauntDebuff: false, lastPicked: null },
          picks, playerStates, targetUid: null, turnLog: [], betweenReady: {},
        }).then(() => setRoomStatus(roomId, 'battle'))
          .catch(console.error)
          .finally(() => { hostResolvingRef.current = false; });
      }
      return;
    }

    if (!battle) return;

    // 결과 확인 완료 → 다음 페이즈
    if (battle.phase === 'result') {
      const allUids = Object.keys(battle.playerStates || {});
      const nextReady = battle.nextReady || {};
      if (allUids.length > 0 && allUids.every(uid => nextReady[uid])) {
        hostResolvingRef.current = true;
        const aliveUids = allUids.filter(uid => (battle.playerStates[uid]?.hp ?? 0) > 0);
        if (battle.enemy.hp <= 0) {
          // 층 클리어
          const isBossFloor = [5,10,15,20,25].includes(battle.floor);
          const bossHeal = isBossFloor ? Math.floor((Object.values(battle.playerStates)[0]?.maxHp || 100) * 0.2) : 0;
          writeBattle(roomId, { phase: 'between', betweenReady: {}, nextReady: {}, bossHealGained: bossHeal })
            .catch(console.error).finally(() => { hostResolvingRef.current = false; });
        } else if (aliveUids.length < allUids.length) {
          // 한 명이라도 사망 → 전체 게임 오버
          writeBattle(roomId, { phase: 'game_over', nextReady: {} })
            .catch(console.error).finally(() => { hostResolvingRef.current = false; });
        } else {
          // 다음 턴
          const newPicks = {};
          aliveUids.forEach(uid => { newPicks[uid] = null; });
          writeBattle(roomId, { picks: newPicks, phase: 'pick', turnLog: [], nextReady: {} })
            .catch(console.error).finally(() => { hostResolvingRef.current = false; });
        }
      }
      return;
    }

    // 픽 완료 → 턴 계산
    if (battle.phase === 'pick') {
      // playerStates 기준으로 살아있는 플레이어만 (hp > 0)
      const aliveUids = Object.keys(battle.playerStates || {}).filter(uid => (battle.playerStates[uid]?.hp ?? 0) > 0);
      if (aliveUids.length === 0) return;
      const picks = battle.picks || {};
      const allPicked = aliveUids.every(uid => picks[uid] != null);
      if (!allPicked) return;

      hostResolvingRef.current = true;
      const result = resolveMultiTurn(battle, picks, roomData.players);
      if (!result) { hostResolvingRef.current = false; return; }
      const { newEnemy, newPlayerStates, targetUid, eCard, eCardsPerPlayer, dmgToEnemyPerPlayer, logs } = result;
      const playedCards = { ...picks }; // 리셋 전 제출된 카드 보존
      const newPicks = {};
      aliveUids.forEach(uid => { newPicks[uid] = null; });
      writeBattle(roomId, {
        enemy: newEnemy, playerStates: newPlayerStates,
        picks: newPicks, playedCards,
        targetUid, eCard, eCardsPerPlayer: eCardsPerPlayer || {},
        dmgToEnemyPerPlayer: dmgToEnemyPerPlayer || {},
        turnLog: logs, phase: 'result',
      }).catch(console.error).finally(() => { hostResolvingRef.current = false; });
    }

    // between 완료 → 다음 층
    if (battle.phase === 'between') {
      const aliveUids = Object.keys(battle.playerStates || {}).filter(uid => (battle.playerStates[uid]?.hp ?? 0) > 0);
      if (aliveUids.length === 0) return;
      const betweenReady = battle.betweenReady || {};
      if (!aliveUids.every(uid => betweenReady[uid])) return;

      hostResolvingRef.current = true;
      const nextFloor = (battle.floor || 1) + 1;
      const nextEnemy = getMonsterMulti(nextFloor, aliveUids.length);
      const n = nextEnemy.isBoss ? 3 : nextFloor >= 16 ? 3 : nextFloor >= 11 ? 2 : nextFloor >= 6 ? 1 : 0;
      const bossSkills = n > 0 ? [...ALL_BOSS_SKILL_IDS].sort(() => Math.random() - 0.5).slice(0, n) : [];
      const newPicks = {};
      aliveUids.forEach(uid => { newPicks[uid] = null; });
      writeBattle(roomId, {
        floor: nextFloor,
        maxFloor: Math.max(battle.maxFloor || 0, battle.floor || 1),
        enemy: { ...nextEnemy, eBasicUsed: { ...EMPTY_BASIC_USED }, eBossSkillsUsed: {}, bossSkills, eCharge: false, eStunned: false, eTauntDebuff: false, lastPicked: null },
        picks: newPicks, betweenReady: {}, phase: 'pick', turnLog: [],
      }).catch(console.error).finally(() => { hostResolvingRef.current = false; });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomData]);

  // ── 페이즈 전환 시 로컬 상태 리셋 ──
  useEffect(() => {
    if (roomData?.battle?.phase === 'pick') setMultiPicked(null);
    if (roomData?.battle?.phase !== 'result') setMultiNextClicked(false);
  }, [roomData?.battle?.phase]);

  // ── 멀티 보스층 진입 시 WARNING (층당 1회) ──
  useEffect(() => {
    const battle = roomData?.battle;
    if (!battle || battle.phase !== 'pick') return;
    if (!battle.enemy?.isBoss) return;
    if (bossWarnedFloorRef.current === battle.floor) return;
    bossWarnedFloorRef.current = battle.floor;
    clearTimeout(bossWarnRef.current);
    setBossWarning(true);
    bossWarnRef.current = setTimeout(() => setBossWarning(false), 2000);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomData?.battle?.floor, roomData?.battle?.phase]);

  // ── 비호스트 화면 전환 감지 ──
  useEffect(() => {
    if (!roomData || !user?.uid) return;
    const isHost = roomData.hostUid === user.uid;
    // 직업 선택 페이즈
    if (roomData.status === 'job_select' && screen === 'multi_lobby') {
      setJobSlideIdx(0); setJobSlideDir('right');
      setScreen('multi_job_pick');
    }
    // 전투 시작
    if (roomData.status === 'battle' && roomData.battle && screen === 'multi_job_pick') {
      setMultiPicked(null);
      setScreen('multi_battle');
    }
    if (!isHost && roomData.status === 'battle' && roomData.battle && screen === 'multi_lobby') {
      setMultiPicked(null);
      setScreen('multi_battle');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomData?.status, roomData?.battle?.phase]);

  // ── 방 플레이어 카드 이미지 프리로드 (비호스트 느린 로딩 방지) ──
  const roomPlayerCardIds = roomData
    ? Object.values(roomData.players || {}).map(p => p.cardId || '').filter(Boolean).sort().join(',')
    : '';
  useEffect(() => {
    if (!roomPlayerCardIds) return;
    roomPlayerCardIds.split(',').forEach(cardId => {
      const def = CARDS.find(c => c.id === cardId);
      if (def?.img) { const img = new Image(); img.src = `/${def.img}`; }
    });
  }, [roomPlayerCardIds]);

  // ── 멀티 로비 로딩 ──
  useEffect(() => {
    if (screen !== 'multi_lobby') return;
    // roomData가 5초 내로 안 오면 오류 안내
    const t = setTimeout(() => {
      if (!roomData) { showToast('방 정보를 불러오지 못했습니다. Firebase 보안 규칙을 확인하세요.'); setRoomId(null); setScreen('multi_list'); }
    }, 5000);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, roomData]);

  // ── pick 페이즈 HP 스냅샷 저장 ──
  useEffect(() => {
    if (roomData?.battle?.phase === 'pick') {
      prevPickStateRef.current = {
        playerStates: roomData.battle.playerStates,
        enemyHp: roomData.battle.enemy?.hp,
      };
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomData?.battle?.phase]);

  // ── 멀티 채팅 감지 ──
  useEffect(() => {
    const players = roomData?.players;
    if (!players) return;
    Object.entries(players).forEach(([uid, p]) => {
      const chat = p.chat;
      if (!chat?.msg || !chat?.ts) return;
      if (lastChatTsRef.current[uid] === chat.ts) return;
      lastChatTsRef.current[uid] = chat.ts;
      setChatBubbles(prev => ({ ...prev, [uid]: chat.msg }));
      clearTimeout(chatTimersRef.current[uid]);
      chatTimersRef.current[uid] = setTimeout(() => {
        setChatBubbles(prev => { const n = { ...prev }; delete n[uid]; return n; });
      }, 3000);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomData]);

  const handleSendChat = (e) => {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    setShowChatInput(false);
    const msg = chatInput.trim();
    setChatInput('');
    if (!msg || !roomId || !user?.uid) return;
    sendChat(roomId, user.uid, msg).catch(console.error);
  };

  // ── 순차 전투 시퀀스 (result 수신 시 1:1 카드 reveal + 애니메이션) ──
  const lastResultKeyRef = useRef(null);
  useEffect(() => {
    const battle = roomData?.battle;
    if (!battle || battle.phase !== 'result') {
      lastResultKeyRef.current = null;
      fightSeqTimersRef.current.forEach(clearTimeout);
      setFightStep(-1);
      setFightStepFlipped(false);
      setLogRevealIdx(0);
      return;
    }

    // Firebase 업데이트 시 배열 참조가 매번 바뀌므로, 같은 결과에 대해 중복 실행 방지
    const resultKey = `${battle.floor}-${battle.enemy?.hp}-${(battle.turnLog||[]).length}-${battle.turnLog?.[0]||''}`;
    if (lastResultKeyRef.current === resultKey) return;
    lastResultKeyRef.current = resultKey;

    const rPlayers = roomData.players || {};
    const sortedUids = Object.keys(battle.playedCards || {})
      .sort((a, b) => (rPlayers[a]?.slot || 0) - (rPlayers[b]?.slot || 0));

    // playedCards 없으면 (구버전 데이터) 바로 완료로
    if (!sortedUids.length) { setFightStep(-2); return; }

    fightSeqTimersRef.current.forEach(clearTimeout);
    fightSeqTimersRef.current = [];

    setFightStep(0);
    setFightStepFlipped(false);

    const FLIP_DELAY   = 450;  // 카드 뒤집기 딜레이
    const STEP_DURATION = 2000; // 한 전투당 표시 시간

    let offset = 0;
    sortedUids.forEach((uid, i) => {
      // 카드 뒤집기 + 해당 전투 애니메이션
      const t1 = setTimeout(() => {
        setFightStepFlipped(true);

        const prev = prevPickStateRef.current;
        const ps = battle.playerStates?.[uid] || {};

        // 플레이어 런지 (공격 애니)
        if (ps.lunge) {
          setMultiLunges(p => ({ ...p, [uid]: true }));
          setTimeout(() => setMultiLunges(p => ({ ...p, [uid]: false })), 500);
        }

        // 적 데미지 float (이 플레이어가 딜을 넣은 경우)
        const eDmg = battle.dmgToEnemyPerPlayer?.[uid] || 0;
        if (eDmg > 0) {
          clearTimeout(multiEFloatRef.current);
          setMultiEFloat({ val: eDmg, type: 'dmg', k: Date.now() });
          setMultiEShake(true);
          multiEFloatRef.current = setTimeout(() => { setMultiEFloat(null); setMultiEShake(false); }, 1500);
        }

        // 플레이어 HP 변화 float
        if (prev?.playerStates) {
          const prevHp = prev.playerStates[uid]?.hp;
          const diff = ps.hp - (prevHp ?? ps.hp);
          if (diff < 0) {
            clearTimeout(multiPFloatRefs.current[uid]);
            setMultiPFloats(p => ({ ...p, [uid]: { val: -diff, type: 'dmg', k: Date.now() } }));
            multiPFloatRefs.current[uid] = setTimeout(() => setMultiPFloats(p => { const n = {...p}; delete n[uid]; return n; }), 1500);
            setMultiPShakes(p => ({ ...p, [uid]: true }));
            setTimeout(() => setMultiPShakes(p => ({ ...p, [uid]: false })), 520);
          } else if (diff > 0) {
            clearTimeout(multiPFloatRefs.current[uid]);
            setMultiPFloats(p => ({ ...p, [uid]: { val: diff, type: 'heal', k: Date.now() } }));
            multiPFloatRefs.current[uid] = setTimeout(() => setMultiPFloats(p => { const n = {...p}; delete n[uid]; return n; }), 1500);
          }
        }
      }, offset + FLIP_DELAY);
      fightSeqTimersRef.current.push(t1);

      offset += STEP_DURATION;

      // 다음 전투로 전환
      if (i < sortedUids.length - 1) {
        const t2 = setTimeout(() => { setFightStep(i + 1); setFightStepFlipped(false); }, offset);
        fightSeqTimersRef.current.push(t2);
      } else {
        // 모든 전투 완료 → 로그 순차 공개 시작
        const t2 = setTimeout(() => {
          setFightStep(-2);
          setFightStepFlipped(false);
          const log = battle.turnLog || [];
          log.forEach((_, li) => {
            const t3 = setTimeout(() => setLogRevealIdx(li + 1), li * 280 + 80);
            fightSeqTimersRef.current.push(t3);
          });
        }, offset);
        fightSeqTimersRef.current.push(t2);
      }
    });

    return () => fightSeqTimersRef.current.forEach(clearTimeout);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomData?.battle?.phase, (roomData?.battle?.turnLog||[]).length, roomData?.battle?.turnLog?.[0]]);

  // ── 카드 선택 슬라이더 헬퍼 ──
  const selCardGo = (nextIdx, dir) => {
    setSelCardSlideDir(dir);
    setSelCardSlideKey(k => k + 1);
    setSelCardIdx(nextIdx);
  };

  const ownedCards = gs?.ownedCards || [];
  const getCharCards = (charId) =>
    CARDS.filter(def => cardBelongsToChar(def.id, charId) && ownedCards.some(inst => inst.id === def.id))
         .map(def => ownedCards.find(inst => inst.id === def.id));

  const charGroups = (() => {
    const groups = CHARACTERS.map(c => ({ ...c, cards: getCharCards(c.id) }));
    const otherCards = getCharCards('other');
    if (otherCards.length > 0) groups.push({ id: 'other', name: '기타', cards: otherCards });
    return groups;
  })();

  // ── 카드 선택 → 직업 선택 화면으로 ──
  const handleSelectCard = (inst) => {
    setPendingCardInst(inst);
    setJobSlideIdx(0);
    setJobSlideDir('right');
    if (cardSelectCtx === 'multi') {
      // 멀티: 카드 선택 후 직업 선택 → 로비로
      setScreen('multi_job_select');
    } else {
      setScreen('job_select');
    }
  };

  const jobGo = (nextIdx, dir) => {
    setJobSlideDir(dir);
    setJobSlideKey(k => k + 1);
    setJobSlideIdx(nextIdx);
  };

  // ── 런 시작 ──
  const doStartRun = (inst, jobId) => {
    const def = CARDS.find(c => c.id === inst.id);
    if (!def) return;
    const base = JOB_BASE_STATS[jobId] || PLAYER_BASE;
    setRun({
      floor: 1,
      playerCardDef: def,
      player: { ...base },
      enemy: getMonster(1),
      skills: [],
      skillsUsed: {},
      basicUsed: { ...EMPTY_BASIC_USED },
      eBasicUsed: { ...EMPTY_BASIC_USED },
      eBossSkillsUsed: {},
      bossSkills: [],
      pCharge: false, eCharge: false,
      eTauntDebuff: false, pTauntDebuff: false,
      pStunned: false, eStunned: false,
      battlePhase: 'pick',
      playerPicked: null, enemyPicked: null,
      turnLog: [],
      maxFloor: 0,
      pendingSkillChoices: null,
      bossHealGained: 0,
      gold: 0,
      pendingBuffs: {},
      preBuffStats: null,
      job: jobId,
      rogueReady: false,
      critBonus: 0,
      pBattlecryTurns: 0,
      pIroncladTurns: 0,
      pSmokescreenNext: false,
      ePoisonTurns: 0,
      ePermDefMult: 1.0,
      ePermAtkMult: 1.0,
      eAtkNextDebuff: 0,
    });
    setScreen('battle');
  };

  const showFloat = (setter, refObj, val, type) => {
    clearTimeout(refObj.current);
    setter({ val, type, k: Date.now() });
    refObj.current = setTimeout(() => setter(null), 1600);
  };

  // ── 카드 선택 ──
  const handlePickCard = (cardId, source) => {
    if (!run || run.battlePhase !== 'pick') return;
    if (source === 'basic' && run.basicUsed[cardId]) return;
    if (source === 'skill' && run.skillsUsed[cardId]) return;
    if (cardId === 'rage' && run.player.hp <= Math.floor(run.player.maxHp * 0.5)) {
      showToast('체력이 부족해 사망합니다');
      return;
    }

    const ePick = enemyPickCard(run.eBasicUsed, run.bossSkills, run.eBossSkillsUsed, run.enemyPicked);
    const ePickIsBossSkill = !!(run.bossSkills?.includes(ePick));

    const newBasicUsed      = source === 'basic'  ? { ...run.basicUsed,  [cardId]: true } : run.basicUsed;
    const newSkillsUsed     = source === 'skill'  ? { ...run.skillsUsed, [cardId]: true } : run.skillsUsed;
    const newEBasicUsed     = ePickIsBossSkill ? run.eBasicUsed : { ...run.eBasicUsed, [ePick]: true };
    const newEBossSkillsUsed = ePickIsBossSkill ? { ...(run.eBossSkillsUsed || {}), [ePick]: true } : (run.eBossSkillsUsed || {});

    setPickedId(cardId);
    setCardFlipped(false);
    setRun(prev => ({
      ...prev,
      basicUsed: newBasicUsed,
      skillsUsed: newSkillsUsed,
      eBasicUsed: newEBasicUsed,
      eBossSkillsUsed: newEBossSkillsUsed,
      playerPicked: cardId,
      enemyPicked: ePick,
      battlePhase: 'reveal',
    }));

    setTimeout(() => setCardFlipped(true), 280);

    setTimeout(() => {
      setRun(prev => {
        if (!prev) return prev;
        const r = resolveTurn(cardId, ePick, prev);

        const eDmgDelta = prev.enemy.hp - Math.max(0, r.eHp);
        const pDmgDelta = prev.player.hp - Math.max(0, r.pHp);
        const pHealGain = Math.max(0, r.pHp) - Math.min(prev.player.hp, r.pMaxHp);

        if (eDmgDelta > 0) {
          setPLunge(true); setTimeout(() => setPLunge(false), 480);
          setTimeout(() => { setEShake(true); setTimeout(() => setEShake(false), 400); }, 200);
          if (r.multiHits && r.multiHits.length > 1) {
            r.multiHits.forEach((dmg, i) => {
              setTimeout(() => showFloat(setEFloat, floatERef, dmg, 'dmg'), i * 260);
            });
          } else {
            showFloat(setEFloat, floatERef, eDmgDelta, 'dmg');
          }
        }
        if (pDmgDelta > 0) {
          showFloat(setPFloat, floatPRef, pDmgDelta, 'dmg');
          setPShake(true); setTimeout(() => setPShake(false), 520);
        } else if (pHealGain > 0) {
          showFloat(setPFloat, floatPRef, pHealGain, 'heal');
        }

        return {
          ...prev,
          player: { ...prev.player, hp: r.pHp, maxHp: r.pMaxHp },
          enemy:  { ...prev.enemy,  hp: r.eHp, maxHp: r.eMaxHp },
          pCharge: r.pCharge, eCharge: r.eCharge,
          eTauntDebuff: false, pTauntDebuff: false,
          pStunned: r.pStunnedNext, eStunned: r.eStunnedNext,
          rogueReady: r.rogueReady,
          pBattlecryTurns:  r.pBattlecryTurns,
          pIroncladTurns:   r.pIroncladTurns,
          pSmokescreenNext: r.pSmokescreenNext,
          ePoisonTurns:     r.ePoisonTurns,
          ePermDefMult:     r.ePermDefMult,
          ePermAtkMult:     r.ePermAtkMult,
          eAtkNextDebuff:   r.eAtkNextDebuff,
          turnLog: r.log,
          battlePhase: 'result',
        };
      });
    }, 1050);
  };

  // ── 다음 턴 ──
  const handleNextTurn = () => {
    if (!run) return;
    const { player, enemy } = run;
    if (player.hp <= 0) { doGameOver(); return; }
    if (enemy.hp <= 0)  { doFloorClear(); return; }

    const allBasicUsed = BASIC_CARDS.every(c => run.basicUsed[c.id]);
    const basicUsed = allBasicUsed ? { ...EMPTY_BASIC_USED } : run.basicUsed;

    const allEBasicUsed = BASIC_CARDS.every(c => run.eBasicUsed[c.id]);
    const eBasicUsed = allEBasicUsed ? { ...EMPTY_BASIC_USED } : run.eBasicUsed;

    setCardFlipped(false);
    setPickedId(null);
    setRun(prev => ({
      ...prev,
      basicUsed, eBasicUsed,
      battlePhase: 'pick',
      playerPicked: null, enemyPicked: null,
      turnLog: [],
    }));
  };

  // ── 층 클리어 ──
  const doFloorClear = () => {
    setStatDraft({ hp: 0, atk: 0, def: 0 });
    setRun(prev => {
      let player = prev.player;

      // 버프 적용 중이었다면 원래 스탯으로 복원 (HP는 비율 유지)
      if (prev.preBuffStats) {
        const hpRatio = player.hp / player.maxHp;
        const ps = prev.preBuffStats;
        player = { ...player, atk: ps.atk, def: ps.def, maxHp: ps.maxHp, hp: Math.min(ps.maxHp, Math.ceil(ps.maxHp * hpRatio)) };
      }

      const isBossFloor = [5, 10, 15, 20, 25].includes(prev.floor);
      let bossHealGained = 0;
      if (isBossFloor) {
        bossHealGained = Math.floor(player.maxHp * 0.2);
        player = { ...player, hp: Math.min(player.maxHp, player.hp + bossHealGained) };
      }

      const choices = pickSkillChoices(prev.skills, prev.job);
      return {
        ...prev,
        player,
        maxFloor: Math.max(prev.maxFloor, prev.floor),
        gold: prev.gold + 10,
        pendingSkillChoices: choices,
        bossHealGained,
        pendingStatPoints: isBossFloor ? 10 : 5,
        preBuffStats: null,
        critBonus: (prev.critBonus || 0) + (prev.job === 'warrior' ? 0.01 : 0),
        ePoisonTurns: 0,
        ePermDefMult: 1.0,
        ePermAtkMult: 1.0,
        eAtkNextDebuff: 0,
      };
    });
    setScreen('stat_assign');
  };

  // ── 스탯 배분 ──
  const statTotal = statDraft.hp + statDraft.atk + statDraft.def;
  const statPoints = run?.pendingStatPoints ?? 5;
  const applyStats = () => {
    if (statTotal < statPoints) { showToast('포인트를 모두 배분해야 합니다'); return; }
    setRun(prev => ({
      ...prev,
      player: {
        ...prev.player,
        maxHp: prev.player.maxHp + statDraft.hp * 10,
        hp:    prev.player.hp    + statDraft.hp * 10,
        atk:   prev.player.atk  + statDraft.atk,
        def:   prev.player.def  + statDraft.def,
      },
    }));
    setStatDraft({ hp: 0, atk: 0, def: 0 });
    setScreen('skill_select');
  };

  // ── 스킬 선택 ──
  const handlePickSkill = id => {
    setRun(prev => ({ ...prev, skills: [...prev.skills, id] }));
    setScreen('shop');
  };

  // ── 상점 구매 ──
  const handleBuyItem = (itemId) => {
    const item = SHOP_ITEMS.find(i => i.id === itemId);
    if (!item) return;
    if (run.gold < item.price) { showToast('골드가 부족합니다'); return; }
    if (item.once && run.pendingBuffs[itemId]) { showToast('이미 구매했습니다'); return; }

    setRun(prev => {
      let state = { ...prev, gold: prev.gold - item.price };
      if (itemId === 'potion') {
        const heal = Math.floor(prev.player.maxHp * 0.3);
        state = { ...state, player: { ...prev.player, hp: Math.min(prev.player.maxHp, prev.player.hp + heal) } };
        showToast(`체력 +${heal} 회복!`);
      } else {
        state = { ...state, pendingBuffs: { ...prev.pendingBuffs, [itemId]: true } };
        showToast(`${item.name} 구매!`);
      }
      return state;
    });
  };

  // ── 다음 층 진입 ──
  const proceedToNextFloor = () => {
    setRun(prev => {
      if (!prev) return prev;
      const nextFloor = prev.floor + 1;
      const enemy = getMonster(nextFloor);

      // 구매한 버프 적용
      const buffs = prev.pendingBuffs || {};
      let player = { ...prev.player };
      const hasBuffs = buffs.atk_buf || buffs.def_buf || buffs.hp_buf;
      const preBuffStats = hasBuffs ? { atk: player.atk, def: player.def, maxHp: player.maxHp } : null;

      if (buffs.atk_buf) player = { ...player, atk: Math.floor(player.atk * 1.5) };
      if (buffs.def_buf) player = { ...player, def: Math.floor(player.def * 1.5) };
      if (buffs.hp_buf) {
        const newMax = Math.floor(player.maxHp * 1.5);
        player = { ...player, maxHp: newMax, hp: Math.min(newMax, player.hp + (newMax - player.maxHp)) };
      }

      setScreen('battle');
      if (enemy.isBoss) {
        clearTimeout(bossWarnRef.current);
        setBossWarning(true);
        bossWarnRef.current = setTimeout(() => setBossWarning(false), 2000);
      }

      return {
        ...prev, floor: nextFloor, enemy, player,
        pendingBuffs: {},
        preBuffStats,
        skillsUsed: {},
        basicUsed: { ...EMPTY_BASIC_USED },
        eBasicUsed: { ...EMPTY_BASIC_USED },
        eBossSkillsUsed: {},
        bossSkills: (() => { const n = enemy.isBoss ? 3 : nextFloor >= 16 ? 3 : nextFloor >= 11 ? 2 : nextFloor >= 6 ? 1 : 0; return n > 0 ? [...ALL_BOSS_SKILL_IDS].sort(() => Math.random() - 0.5).slice(0, n) : []; })(),
        pStunned: false, eStunned: false,
        battlePhase: 'pick', playerPicked: null, enemyPicked: null, turnLog: [],
      };
    });
  };

  // ── 게임 오버 ──
  const doGameOver = async () => {
    if (!run) return;
    const cleared = Math.max(0, run.maxFloor);
    const isHidden = cleared >= 26;
    if (cleared > myBest && user) {
      const best = { floor: cleared, weekKey, hidden: isHidden, cardId: run.playerCardDef.id };
      setGs(prev => ({ ...prev, towerBest: best }));
      updateDoc(doc(db, 'users', user.uid), { towerBest: best }).catch(console.error);
    }
    setScreen('game_over');
  };

  // ── 드래그 핸들러 ──
  const handleCardTouchStart = (e, cardId, source) => {
    if (!run || run.battlePhase !== 'pick') return;
    if (source === 'basic' && run.basicUsed[cardId]) return;
    if (source === 'skill' && run.skillsUsed[cardId]) return;
    const touch = e.touches[0];
    setDragging({ id: cardId, source, x: touch.clientX, y: touch.clientY, moved: false });
  };

  const handleDragMove = (e) => {
    if (!dragging) return;
    const touch = e.touches[0];
    setDragging(prev => prev ? { ...prev, x: touch.clientX, y: touch.clientY, moved: true } : null);
  };

  const handleDragEnd = (e) => {
    if (!dragging) return;
    const touch = e.changedTouches[0];
    const loungeEl = loungeRef.current;
    if (loungeEl) {
      const rect = loungeEl.getBoundingClientRect();
      if (
        touch.clientX >= rect.left && touch.clientX <= rect.right &&
        touch.clientY >= rect.top  && touch.clientY <= rect.bottom
      ) {
        handlePickCard(dragging.id, dragging.source);
      }
    }
    setDragging(null);
  };


  // ════════════════════ 화면 렌더 ════════════════════

  if (screen === 'intro') return (
    <div className="tower-screen">
      {toast && <div className="cw-toast">{toast}</div>}
      {rejoinRoomId && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--surface)', borderRadius: 16, padding: '28px 24px', maxWidth: 320, width: '90%', textAlign: 'center', boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}>
            <div style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>진행 중인 멀티 던전이 있습니다</div>
            <div style={{ fontSize: '0.82rem', color: 'var(--muted)', marginBottom: 20 }}>다시 참여하시겠습니까?</div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button className="tower-primary-btn" style={{ flex: 1 }} onClick={() => {
                rejoinPendingRef.current = true;
                setRoomId(rejoinRoomId);
                setRejoinRoomId(null);
              }}>다시 참여</button>
              <button className="tower-primary-btn" style={{ flex: 1, background: 'rgba(255,255,255,0.08)' }} onClick={() => {
                sessionStorage.removeItem('tw_roomId');
                setRejoinRoomId(null);
              }}>나가기</button>
            </div>
          </div>
        </div>
      )}
      <div className="tower-intro-wrap">
        <div className="tower-intro-title">도전의 탑 <span className="tower-beta-badge">BETA</span></div>
        <div className="tower-intro-notice">
          베타버전으로 버그와 밸런스가 맞지 않을 수 있습니다. 차차 수정해 나가겠습니다.
        </div>
        <div className="tower-intro-rules">
          {[
            '공격/방어/회피 3장의 기본 카드를 순서대로 사용하며 전투합니다',
            '3장을 모두 사용해야 다시 사용할 수 있습니다',
            '적도 같은 방식으로 3장을 순환합니다 — 수싸움이 핵심!',
            '방어력은 방어 카드 사용 시에만 적용됩니다 (기본 방어 없음)',
            '스킬 카드는 최대 3장 보유 (마법사는 4장), 스테이지당 1회 사용',
            '층 클리어 시 스킬 3장 제시 — 공용 + 직업 고유 스킬 풀에서 랜덤',
            '스테이지 클리어 시 10골드, 스탯 포인트 5점 획득',
            '보스 층(5·10·15·20·25층) 클리어 시 체력 20% 회복',
            '카드 선택 후 직업 5종 중 1개를 골라 고유 스탯/패시브/스킬을 받습니다',
            '사망 시 런 종료, 최고 기록이 주간 랭킹에 반영됩니다',
          ].map((r, i) => (
            <div key={i} className="tower-intro-rule"><span className="tower-intro-dot" /><span>{r}</span></div>
          ))}
        </div>
        {myBest > 0 && <div className="tower-intro-best">내 이번 주 최고: <strong>{myBest}층</strong></div>}
        <div className="tower-intro-btns">
          <button className="tower-primary-btn" onClick={() => {
            if (isGuest) { showToast('로그인이 필요합니다'); return; }
            setCardSelectCtx('single'); setSelCharIdx(0); setSelCardIdx(0); setScreen('select');
          }}>싱글 플레이</button>
          <button className="tower-primary-btn" style={{ background: 'linear-gradient(135deg,#7c3aed,#4c1d95)' }} onClick={() => {
            if (isGuest) { showToast('로그인이 필요합니다'); return; }
            setScreen('multi_list');
          }}>멀티 플레이</button>
        </div>
      </div>
    </div>
  );

  // 직업 정보 패널 (스탯 + 스킬 목록)
  const renderJobInfo = (job) => {
    const stats = JOB_BASE_STATS[job.id];
    const commonSkills = SKILL_CARDS.filter(c => c.job === null);
    const exclusiveSkills = SKILL_CARDS.filter(c => c.job === job.id);
    return (
      <div className="job-info-panel">
        <div className="job-stats-row">
          {[['체력', stats?.maxHp, '#4ade80'], ['공격', stats?.atk, '#ef4444'], ['방어', stats?.def, '#60a5fa']].map(([label, val, color]) => (
            <div key={label} className="job-stat-box">
              <span className="job-stat-label">{label}</span>
              <span className="job-stat-val" style={{ color }}>{val}</span>
            </div>
          ))}
        </div>
        <div className="job-skills-section">
          <div className="job-skills-group-label">공용 스킬 ({commonSkills.length})</div>
          <div className="job-skills-row">
            {commonSkills.map(s => (
              <div key={s.id} className="job-skill-chip" style={{ '--sc': s.color }}>
                {s.img && <img src={s.img} alt={s.name} />}
                <span>{s.name}</span>
              </div>
            ))}
          </div>
          <div className="job-skills-group-label exclusive" style={{ color: job.color }}>직업 고유 스킬 ({exclusiveSkills.length})</div>
          <div className="job-skills-row">
            {exclusiveSkills.map(s => (
              <div key={s.id} className="job-skill-chip exclusive" style={{ '--sc': s.color }}>
                {s.img && <img src={s.img} alt={s.name} />}
                <span>{s.name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  // 멀티 직업 선택 (로비용)
  if (screen === 'multi_job_select' && pendingCardInst) {
    const currentJob = JOBS[jobSlideIdx];
    return (
      <div className="sk-screen">
        <div className="sk-header">
          <div className="sk-title">직업 선택</div>
          <div className="sk-sub">런에서 함께할 직업을 고르세요</div>
        </div>
        <div className="sk-slider-wrap">
          <button className="wp-arrow" onClick={() => jobGo((jobSlideIdx - 1 + JOBS.length) % JOBS.length, 'left')}>‹</button>
          <div className="sk-card-area">
            <div key={jobSlideKey} className={`sk-slide wp-slide-${jobSlideDir}`} style={{ '--sc': currentJob.color }}>
              <img src={currentJob.img} alt={currentJob.name} />
              <div className="sk-slide-overlay">
                <div className="sk-slide-name">{currentJob.name}</div>
                <div className="sk-slide-desc">{currentJob.desc}</div>
              </div>
            </div>
          </div>
          <button className="wp-arrow" onClick={() => jobGo((jobSlideIdx + 1) % JOBS.length, 'right')}>›</button>
        </div>
        <div className="wp-dots">
          {JOBS.map((_, i) => (
            <div key={i} className={`wp-dot${i === jobSlideIdx ? ' active' : ''}`}
              onClick={() => jobGo(i, i > jobSlideIdx ? 'right' : 'left')} />
          ))}
        </div>
        {renderJobInfo(currentJob)}
        <button className="sk-pick-btn"
          style={{ background: `linear-gradient(135deg, ${currentJob.color}, ${currentJob.color}99)` }}
          onClick={async () => {
            if (!roomId || !user) return;
            const def = CARDS.find(c => c.id === pendingCardInst.id);
            await rtdbSetCard(roomId, user.uid, pendingCardInst.id, def?.img ? `/${def.img}` : null);
            await rtdbSetJob(roomId, user.uid, currentJob.id);
            setJobSlideIdx(0); setScreen('multi_lobby');
          }}>
          {currentJob.name} 선택
        </button>
        <button className="sk-skip-btn" onClick={() => setScreen('select')}>← 카드 다시 선택</button>
      </div>
    );
  }

  // 직업 선택
  if (screen === 'job_select' && pendingCardInst) {
    const currentJob = JOBS[jobSlideIdx];
    return (
      <div className="sk-screen">
        <div className="sk-header">
          <div className="sk-title">직업 선택</div>
          <div className="sk-sub">런에서 함께할 직업을 고르세요</div>
        </div>
        <div className="sk-slider-wrap">
          <button className="wp-arrow" onClick={() => jobGo((jobSlideIdx - 1 + JOBS.length) % JOBS.length, 'left')}>‹</button>
          <div className="sk-card-area">
            <div key={jobSlideKey} className={`sk-slide wp-slide-${jobSlideDir}`} style={{ '--sc': currentJob.color }}>
              <img src={currentJob.img} alt={currentJob.name} />
              <div className="sk-slide-overlay">
                <div className="sk-slide-name">{currentJob.name}</div>
                <div className="sk-slide-desc">{currentJob.desc}</div>
              </div>
            </div>
          </div>
          <button className="wp-arrow" onClick={() => jobGo((jobSlideIdx + 1) % JOBS.length, 'right')}>›</button>
        </div>
        <div className="wp-dots">
          {JOBS.map((_, i) => (
            <div key={i} className={`wp-dot${i === jobSlideIdx ? ' active' : ''}`}
              onClick={() => jobGo(i, i > jobSlideIdx ? 'right' : 'left')} />
          ))}
        </div>
        {renderJobInfo(currentJob)}
        <button className="sk-pick-btn"
          style={{ background: `linear-gradient(135deg, ${currentJob.color}, ${currentJob.color}99)` }}
          onClick={() => { doStartRun(pendingCardInst, currentJob.id); setJobSlideIdx(0); }}>
          {currentJob.name} 선택
        </button>
        <button className="sk-skip-btn" onClick={() => setScreen('select')}>← 카드 다시 선택</button>
      </div>
    );
  }

  if (screen === 'select') return (
    (() => {
      const backTo = cardSelectCtx === 'multi' ? 'multi_lobby' : 'intro';
      const activeGroup = charGroups[selCharIdx] || charGroups[0];
      const cards = activeGroup?.cards || [];
      const cardIdx = Math.min(selCardIdx, Math.max(0, cards.length - 1));
      const currentInst = cards[cardIdx];
      const currentDef  = currentInst && CARDS.find(c => c.id === currentInst.id);
      return (
        <div className="sk-screen">
          {toast && <div className="cw-toast">{toast}</div>}
          <div className="tw-card-select-topbar">
            <button className="tower-back-btn" onClick={() => setScreen(backTo)}>← 뒤로</button>
            <span className="tower-screen-title">카드 선택</span>
          </div>
          {/* 캐릭터 탭 */}
          <div className="tw-char-tabs">
            {charGroups.map((g, i) => (
              <button key={g.id}
                className={`tw-char-tab${selCharIdx === i ? ' active' : ''}${g.cards.length === 0 ? ' empty' : ''}`}
                onClick={() => { setSelCharIdx(i); setSelCardIdx(0); setSelCardSlideKey(k => k + 1); }}>
                {g.name}
              </button>
            ))}
          </div>
          {cards.length === 0 ? (
            <div className="tower-empty" style={{ marginTop: 32 }}>이 캐릭터의 카드를 보유하지 않았습니다</div>
          ) : (
            <>
              <div className="sk-slider-wrap">
                <button className="wp-arrow" onClick={() => selCardGo((cardIdx - 1 + cards.length) % cards.length, 'left')}>‹</button>
                <div className="sk-card-area">
                  {currentDef && (
                    <div key={selCardSlideKey} className={`sk-slide wp-slide-${selCardSlideDir}`} style={{ '--sc': '#fff' }}>
                      <img src={`/${currentDef.img}`} alt={currentDef.name} />
                      <div className="sk-slide-overlay">
                        <div className="sk-slide-name">{currentDef.name}</div>
                        <div className="sk-slide-desc">{currentDef.grade.toUpperCase()}</div>
                      </div>
                    </div>
                  )}
                </div>
                <button className="wp-arrow" onClick={() => selCardGo((cardIdx + 1) % cards.length, 'right')}>›</button>
              </div>
              <div className="wp-dots">
                {cards.map((_, i) => (
                  <div key={i} className={`wp-dot${i === cardIdx ? ' active' : ''}`}
                    onClick={() => selCardGo(i, i > cardIdx ? 'right' : 'left')} />
                ))}
              </div>
              {currentInst && (
                <button className="sk-pick-btn" style={{ background: 'linear-gradient(135deg,#dc2626,#7f1d1d)' }}
                  onClick={() => handleSelectCard(currentInst)}>
                  이 카드 선택
                </button>
              )}
            </>
          )}
        </div>
      );
    })()
  );

  // 전투 화면
  if (screen === 'battle' && run) {
    const { player, enemy, battlePhase, playerPicked, enemyPicked, turnLog, pStunned } = run;
    const pPct = Math.max(0, (player.hp / player.maxHp) * 100);
    const ePct = Math.max(0, (enemy.hp / enemy.maxHp) * 100);
    const pCol = pPct > 60 ? '#4ade80' : pPct > 30 ? '#fbbf24' : '#f87171';
    const eCol = ePct > 60 ? '#4ade80' : ePct > 30 ? '#fbbf24' : '#f87171';
    const pCard    = playerPicked ? getCard(playerPicked) : null;
    const eCardDef = enemyPicked  ? getCard(enemyPicked)  : null;
    const inReveal = battlePhase === 'reveal' || battlePhase === 'result';

    const logClass = l => {
      if (l.includes('데미지') || l.includes('피해') || l.includes('반격') || l.includes('분노')) return 'dmg';
      if (l.includes('회복')  || l.includes('흡수')) return 'heal';
      if (l.includes('방어')  || l.includes('무효') || l.includes('회피') || l.includes('차지') || l.includes('도발')) return 'def';
      if (l.includes('실패')  || l.includes('기절') || l.includes('불가')) return 'bad';
      return '';
    };

    const isDragging = !!dragging;

    // 드래그 중인 카드 렌더 헬퍼
    const renderDragGhost = () => {
      if (!dragging || !dragging.moved) return null;
      const card = getCard(dragging.id);
      return (
        <div className="tw-drag-ghost" style={{ left: dragging.x - 45, top: dragging.y - 55 }}>
          <div className="tw-hcard tw-drag-ghost-card" style={{ '--hcard-color': card.color, borderColor: card.color }}>
            {card.img
              ? <img src={card.img} alt={card.name} className="tw-hcard-img-full" />
              : <><div className="tw-hcard-strip" style={{ background: card.color }} /><div className="tw-hcard-name" style={{ color: card.color }}>{card.name}</div><div className="tw-hcard-desc">{card.desc}</div></>
            }
          </div>
        </div>
      );
    };

    const renderCard = (cardId, source) => {
      const card = getCard(cardId);
      const used = source === 'basic' ? run.basicUsed[cardId] : !!run.skillsUsed[cardId];
      const locked = battlePhase !== 'pick';
      const isPicked = pickedId === cardId;
      const isSkill = card.type === 'skill';
      return (
        <div
          key={cardId}
          className={`tw-hcard${used ? ' used' : ''}${locked ? ' locked' : ''}${isPicked ? ' picked' : ''}${!used && isSkill ? ' skill-card' : ''}`}
          style={used ? {} : { '--hcard-color': card.color, borderColor: card.color }}
          onClick={() => !locked && !used && !isDragging && setPreviewCard({ id: cardId, source })}
          onTouchStart={e => !locked && !used && handleCardTouchStart(e, cardId, source)}
        >
          {used ? (
            <div className="tw-hcard-back" />
          ) : card.img ? (
            <img src={card.img} alt={card.name} className="tw-hcard-img-full" />
          ) : (
            <>
              <div className="tw-hcard-strip" style={{ background: card.color }} />
              <div className="tw-hcard-name" style={{ color: card.color }}>{card.name}</div>
              <div className="tw-hcard-desc">{card.desc}</div>
              <div className={`tw-hcard-badge ${card.type}`}>{card.type === 'skill' ? 'SKILL' : 'BASIC'}</div>
            </>
          )}
        </div>
      );
    };

    return (
      <div className="tw-battle-wrap"
        onTouchMove={handleDragMove}
        onTouchEnd={handleDragEnd}
      >
        {toast && <div className="cw-toast">{toast}</div>}
        {renderDragGhost()}

        {/* 보스 경고 오버레이 */}
        {bossWarning && (
          <div className="tw-boss-warning">
            <div className="tw-boss-warning-text">⚠ WARNING ⚠</div>
          </div>
        )}

        {/* 카드 확대 미리보기 */}
        {previewCard && battlePhase === 'pick' && (() => {
          const pc = getCard(previewCard.id);
          return (
            <div className="tw-preview-overlay" onClick={() => setPreviewCard(null)}>
              <div className="tw-preview-wrap" onClick={e => e.stopPropagation()}>
                <div className="tw-preview-card" style={{ borderColor: pc.color }}>
                  {pc.img
                    ? <img src={pc.img} alt={pc.name} className="tw-hcard-img-full" />
                    : <><div className="tw-hcard-strip" style={{ background: pc.color }} /><div className="tw-hcard-name" style={{ color: pc.color }}>{pc.name}</div></>
                  }
                </div>
                <div className="tw-preview-info">
                  <div className="tw-preview-name" style={{ color: pc.color }}>{pc.name}</div>
                  <div className="tw-preview-desc">{pc.desc}</div>
                </div>
                <div className="tw-preview-btns">
                  <button className="tw-preview-cancel-btn" onClick={() => setPreviewCard(null)}>취소</button>
                  <button className="tw-preview-play-btn" style={{ background: `linear-gradient(135deg, ${pc.color}cc, ${pc.color})` }}
                    onClick={() => { handlePickCard(previewCard.id, previewCard.source); setPreviewCard(null); }}>
                    사용
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

        {/* 층 바 */}
        <div className="tw-floor-bar">
          <span className={`tw-floor-badge${enemy.isBoss ? ' boss' : ''}`}>
            {enemy.isBoss ? '⚠ ' : ''}{run.floor}층
          </span>
          <span className="tw-deck-info">
            <span className="tw-gold-chip">💰{run.gold}</span>
            &nbsp;스킬 {run.skills.length}/{maxSkills(run.job)}
          </span>
          <button className="tw-flee-btn" onClick={doGameOver}>포기</button>
        </div>

        {/* 아레나 */}
        <div className="tw-arena">
          <div className="tw-combatant" style={{ position: 'relative' }}>
            <img src={`/${run.playerCardDef.img}`} alt={run.playerCardDef.name}
              className={`tw-combatant-img${pShake ? ' tw-shake' : ''}${pLunge ? ' tw-lunge' : ''}`} />
            {pFloat && (
              <div key={pFloat.k} className={`tw-dmg-float ${pFloat.type}`}>
                {pFloat.type === 'dmg' ? `-${pFloat.val}` : `+${pFloat.val}`}
              </div>
            )}
            <div className="tw-combatant-overlay">
              <div className="tw-combatant-name">{run.playerCardDef.name}</div>
              <div className="tw-combatant-hp-row">
                <span style={{ color: pCol, fontFamily: 'Nunito', fontWeight: 900, fontSize: '0.85rem' }}>{player.hp}</span>
                <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.62rem' }}>/{player.maxHp}</span>
              </div>
              <div className="tw-combatant-hpbar">
                <div style={{ width: `${pPct}%`, background: pCol, height: '100%', borderRadius: '99px', transition: 'width 0.6s ease' }} />
              </div>
              <div className="tw-combatant-stats">
                <span>⚔{player.atk}</span><span>🛡{player.def}</span>
                {run.job === 'warrior' && <span className="tw-cbuff" style={{ color: '#ef4444', background: 'rgba(239,68,68,0.16)' }}>크리 {Math.round((0.15 + (run.critBonus || 0)) * 100)}%</span>}
                {run.job && (() => { const j = JOBS.find(jb => jb.id === run.job); return j ? <span className="tw-cbuff" style={{ color: j.color, background: `${j.color}28` }}>{j.name}</span> : null; })()}
                {run.pCharge && <span className="tw-cbuff">차지↑</span>}
                {pStunned && <span className="tw-cbuff stun">기절</span>}
                {run.pendingBuffs?.atk_buf && <span className="tw-cbuff">ATK↑</span>}
                {run.pendingBuffs?.def_buf && <span className="tw-cbuff">DEF↑</span>}
                {run.pendingBuffs?.hp_buf  && <span className="tw-cbuff">HP↑</span>}
              </div>
            </div>
          </div>

          <div className="tw-arena-vs">VS</div>

          <div className={`tw-combatant${enemy.isBoss ? ' boss-combatant' : ''}`} style={{ position: 'relative' }}>
            <img src={enemy.img} alt={enemy.name}
              className={`tw-combatant-img${enemy.hp <= 0 ? ' dead' : ''}${eShake ? ' tw-shake' : ''}${enemy.isBoss ? ' boss-img' : ''}`} />
            {eFloat && (
              <div key={eFloat.k} className={`tw-dmg-float ${eFloat.type}`}>
                {eFloat.type === 'dmg' ? `-${eFloat.val}` : `+${eFloat.val}`}
              </div>
            )}
            <div className="tw-combatant-overlay">
              <div className="tw-combatant-name">{enemy.name}</div>
              <div className="tw-combatant-hp-row">
                <span style={{ color: eCol, fontFamily: 'Nunito', fontWeight: 900, fontSize: '0.85rem' }}>{enemy.hp}</span>
                <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.62rem' }}>/{enemy.maxHp}</span>
              </div>
              <div className="tw-combatant-hpbar">
                <div style={{ width: `${ePct}%`, background: eCol, height: '100%', borderRadius: '99px', transition: 'width 0.6s ease' }} />
              </div>
              <div className="tw-combatant-stats">
                <span>⚔{enemy.atk}</span><span>🛡{enemy.def}</span>
              </div>
            </div>
          </div>
        </div>

        {/* 배틀 라운지 (드래그 드롭존) */}
        <div className={`tw-lounge${isDragging && dragging.moved ? ' drag-target' : ''}`} ref={loungeRef}>
          {inReveal ? (
            <>
              <div className="tw-lounge-cards">
                <div className="tw-reveal-card tw-drop-p" style={{ borderColor: pCard?.color || 'rgba(255,255,255,0.3)' }}>
                  {pCard?.img
                    ? <img src={pCard.img} alt={pCard.name} className="tw-hcard-img-full" />
                    : <><div className="tw-hcard-name" style={{ color: pCard?.color }}>{pCard?.name ?? '—'}</div><div className="tw-hcard-desc">{pCard?.desc ?? ''}</div></>
                  }
                </div>
                <div className="tw-lounge-vs">VS</div>
                <div className={`tw-reveal-card tw-drop-e${cardFlipped ? '' : ' tw-reveal-hidden'}`}
                     style={cardFlipped ? { borderColor: eCardDef?.color || 'rgba(255,255,255,0.3)' } : {}}>
                  {cardFlipped
                    ? (eCardDef?.img
                        ? <img src={eCardDef.img} alt={eCardDef.name} className="tw-hcard-img-full" />
                        : <><div className="tw-hcard-name" style={{ color: eCardDef?.color }}>{eCardDef?.name ?? '—'}</div><div className="tw-hcard-desc">{eCardDef?.desc ?? ''}</div></>)
                    : <span className="tw-back-sym">♠</span>
                  }
                </div>
              </div>
              {battlePhase === 'result' && turnLog.length > 0 && (
                <div className="tw-turn-log">
                  {turnLog.map((l, i) => (
                    <div key={i} className={`tw-log-line ${logClass(l)}`}>{l}</div>
                  ))}
                </div>
              )}
              {battlePhase === 'result' && (
                <button className="tw-next-btn" onClick={handleNextTurn}
                  style={enemy.hp <= 0 ? { background: 'linear-gradient(135deg,#fbbf24,#d97706)', color: '#000' } : {}}>
                  {player.hp <= 0 ? '게임 오버' : enemy.hp <= 0 ? `✨ ${run.floor}층 클리어!` : '다음 턴 →'}
                </button>
              )}
            </>
          ) : (
            <div className="tw-lounge-idle">
              {isDragging && dragging.moved
                ? '여기에 놓으세요!'
                : '카드를 여기로 드래그하거나 탭하세요'}
            </div>
          )}
        </div>

        {/* 손패 */}
        {pStunned && battlePhase === 'pick' ? (
          <div className="tw-stun-bar">
            <span>⚡ 기절 상태 — 이번 턴 행동 불가</span>
            <button className="tw-next-btn" style={{ width: 'auto', padding: '7px 16px' }}
              onClick={() => handlePickCard('pass', 'stunned')}>
              턴 넘기기
            </button>
          </div>
        ) : (
          <div className="tw-cards-area">
            <div className="tw-cards-label">기본 카드</div>
            <div className="tw-hand tw-basic-hand">
              {BASIC_CARDS.map(c => renderCard(c.id, 'basic'))}
            </div>
            {run.skills.length > 0 && (
              <>
                <div className="tw-cards-label">스킬 카드</div>
                <div className="tw-hand tw-skill-hand">
                  {run.skills.map(id => renderCard(id, 'skill'))}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    );
  }

  // 스탯 배분
  if (screen === 'stat_assign' && run) {
    const rem = statPoints - statTotal;
    return (
      <div className="tower-screen">
        <div className="tower-midscreen-wrap">
          <div className="tower-section-title">{run.floor}층 클리어!</div>
          <div className="tw-gold-badge">💰 {run.gold} 골드</div>
          {run.bossHealGained > 0 && (
            <div className="tower-boss-heal">보스 클리어 보상: 체력 +{run.bossHealGained} 회복!</div>
          )}
          <div className="tower-section-sub">스탯 포인트 {statPoints}점을 배분하세요{statPoints > 5 ? ' (보스 보너스!)' : ''}</div>
          <div className="tower-pts-remaining">남은 포인트: <strong>{rem}</strong></div>
          {[
            { key: 'hp',  label: '체력',   note: '1pt → +10 HP' },
            { key: 'atk', label: '공격력', note: '1pt → +1 ATK' },
            { key: 'def', label: '방어력', note: '1pt → +1 DEF' },
          ].map(({ key, label, note }) => (
            <div key={key} className="tower-stat-assign-row">
              <span className="tower-stat-assign-label">{label}</span>
              <span className="tower-stat-assign-note">{note}</span>
              <div className="tower-stepper">
                <button onClick={() => setStatDraft(d => ({ ...d, [key]: Math.max(0, d[key] - 1) }))}>−</button>
                <span>{statDraft[key]}</span>
                <button onClick={() => setStatDraft(d => ({ ...d, [key]: d[key] + 1 }))} disabled={rem <= 0}>+</button>
              </div>
            </div>
          ))}
          <div className="tower-stat-preview-row">
            체력 {run.player.maxHp + statDraft.hp * 10} · 공격 {run.player.atk + statDraft.atk} · 방어 {run.player.def + statDraft.def}
          </div>
          <button className="tower-primary-btn" onClick={applyStats} disabled={rem > 0}>
            {rem > 0 ? `${rem}pt 남음` : '확인'}
          </button>
        </div>
      </div>
    );
  }

  // 스킬 선택
  if (screen === 'skill_select' && run) {
    const choices = run.pendingSkillChoices || [];
    const isFull = run.skills.length >= maxSkills(run.job);

    const skGo = (nextIdx, dir) => {
      setSkillSlideDir(dir);
      setSkillSlideKey(k => k + 1);
      setSkillSlideIdx(nextIdx);
    };

    // 새 스킬 선택 후 — 포기할 스킬 고르기 (슬라이더로)
    if (pendingNewSkill) {
      const replaceIdx = Math.min(skillSlideIdx, run.skills.length - 1);
      const replaceCard = getCard(run.skills[replaceIdx]);
      return (
        <div className="sk-screen">
          <div className="sk-header">
            <div className="sk-title">스킬 교체</div>
            <div className="sk-sub">버릴 스킬을 선택하세요</div>
          </div>
          <div className="sk-new-preview">
            <div className="sk-new-label">추가될 스킬</div>
            <div className="sk-badge-card" style={{ '--sc': pendingNewSkill.color }}>
              {pendingNewSkill.img
                ? <img src={pendingNewSkill.img} alt={pendingNewSkill.name} />
                : <span>{pendingNewSkill.name}</span>}
            </div>
          </div>
          <div className="sk-slider-wrap">
            <button className="wp-arrow" onClick={() => skGo((replaceIdx - 1 + run.skills.length) % run.skills.length, 'left')}>‹</button>
            <div className="sk-card-area">
              <div key={skillSlideKey} className={`sk-slide wp-slide-${skillSlideDir}${replaceCard.job ? ' sk-slide-exclusive' : ''}`}
                style={{ '--sc': replaceCard.color }}>
                {replaceCard.img
                  ? <img src={replaceCard.img} alt={replaceCard.name} />
                  : <div className="sk-slide-noimg">{replaceCard.name}</div>}
                <div className="sk-slide-overlay">
                  <div className="sk-slide-name">{replaceCard.name}</div>
                  <div className="sk-slide-desc">{replaceCard.desc}</div>
                </div>
              </div>
            </div>
            <button className="wp-arrow" onClick={() => skGo((replaceIdx + 1) % run.skills.length, 'right')}>›</button>
          </div>
          <div className="wp-dots">
            {run.skills.map((_, i) => (
              <div key={i} className={`wp-dot${i === replaceIdx ? ' active' : ''}`}
                onClick={() => skGo(i, i > replaceIdx ? 'right' : 'left')} />
            ))}
          </div>
          <button className="sk-pick-btn" style={{ background: `linear-gradient(135deg, #dc2626, #7f1d1d)` }}
            onClick={() => {
              const id = run.skills[replaceIdx];
              setRun(prev => ({ ...prev, skills: prev.skills.map(s => s === id ? pendingNewSkill.id : s) }));
              setPendingNewSkill(null);
              setSkillSlideIdx(0);
              setScreen('shop');
            }}>
            버리고 교체하기
          </button>
          <button className="sk-skip-btn" onClick={() => { setPendingNewSkill(null); setSkillSlideIdx(0); setScreen('shop'); }}>건너뛰기</button>
        </div>
      );
    }

    const safeIdx = Math.min(skillSlideIdx, choices.length - 1);
    const currentCard = choices[safeIdx];

    return (
      <div className="sk-screen">
        <div className="sk-header">
          <div className="sk-title">스킬 카드 획득</div>
          <div className="sk-sub">{isFull ? '선택하면 기존 스킬 중 하나와 교체합니다' : '1장을 선택해 덱에 추가합니다'}</div>
        </div>
        {currentCard && (
          <>
            <div className="sk-slider-wrap">
              <button className="wp-arrow" onClick={() => skGo((safeIdx - 1 + choices.length) % choices.length, 'left')}>‹</button>
              <div className="sk-card-area">
                <div key={skillSlideKey} className={`sk-slide wp-slide-${skillSlideDir}${currentCard.job ? ' sk-slide-exclusive' : ''}`}
                  style={{ '--sc': currentCard.color }}>
                  {currentCard.img
                    ? <img src={currentCard.img} alt={currentCard.name} />
                    : <div className="sk-slide-noimg">{currentCard.name}</div>}
                  <div className="sk-slide-overlay">
                    <div className="sk-slide-name">{currentCard.name}</div>
                    <div className="sk-slide-desc">{currentCard.desc}</div>
                  </div>
                </div>
              </div>
              <button className="wp-arrow" onClick={() => skGo((safeIdx + 1) % choices.length, 'right')}>›</button>
            </div>
            <div className="wp-dots">
              {choices.map((_, i) => (
                <div key={i} className={`wp-dot${i === safeIdx ? ' active' : ''}`}
                  onClick={() => skGo(i, i > safeIdx ? 'right' : 'left')} />
              ))}
            </div>
            <button className="sk-pick-btn" style={{ background: `linear-gradient(135deg, ${currentCard.color}, ${currentCard.color}99)` }}
              onClick={() => {
                setSkillSlideIdx(0);
                isFull ? setPendingNewSkill(currentCard) : handlePickSkill(currentCard.id);
              }}>
              이 스킬 선택
            </button>
          </>
        )}
        <button className="sk-skip-btn" onClick={() => { setSkillSlideIdx(0); setScreen('shop'); }}>건너뛰기</button>
      </div>
    );
  }

  // 마녀의 상점
  if (screen === 'shop' && run) {
    return (
      <div className="tower-screen">
        <div className="tower-midscreen-wrap">
          <div className="tower-section-title">🧙 마녀의 상점</div>
          <div className="tower-witch-gold">보유 골드: <strong>💰 {run.gold}</strong></div>
          <div className="tower-shop-grid">
            {SHOP_ITEMS.map(item => {
              const alreadyBought = !!run.pendingBuffs[item.id] && item.id !== 'potion';
              const canAfford = run.gold >= item.price;
              return (
                <div key={item.id} className={`tower-shop-item${alreadyBought ? ' bought' : ''}${!canAfford && !alreadyBought ? ' cant-afford' : ''}`}>
                  <div className="tower-shop-icon">{item.icon}</div>
                  <div className="tower-shop-name">{item.name}</div>
                  <div className="tower-shop-desc">{item.desc}</div>
                  <button
                    className="tower-shop-btn"
                    disabled={alreadyBought || !canAfford}
                    onClick={() => handleBuyItem(item.id)}
                  >
                    {alreadyBought ? '구매완료' : `💰 ${item.price}`}
                  </button>
                </div>
              );
            })}
          </div>
          <button className="tower-primary-btn" onClick={proceedToNextFloor}>다음 층으로 →</button>
        </div>
      </div>
    );
  }

  // ════════ 멀티플레이 화면들 ════════

  // 방 목록
  if (screen === 'multi_list') {
    const rooms = roomList ? Object.entries(roomList).filter(([, r]) => r.status === 'waiting') : [];
    const doCreate = async () => {
      if (!user || isCreating) return;
      setIsCreating(true);
      try {
        const id = await createRoom(newRoomTitle.trim(), user, gs?.nickname);
        setRoomId(id); setNewRoomTitle(''); setShowCreateModal(false); setScreen('multi_lobby');
      } catch (e) { showToast(e.message || '방 만들기 실패'); }
      finally { setIsCreating(false); }
    };
    return (
      <div className="tower-screen">
        {toast && <div className="cw-toast">{toast}</div>}
        <div className="tower-top-bar">
          <button className="tower-back-btn" onClick={() => setScreen('intro')}>← 뒤로</button>
          <span className="tower-screen-title">멀티플레이</span>
        </div>

        {/* 방 목록 */}
        <div className="tw-room-list-wrap">
          {rooms.length === 0
            ? <div className="tw-room-empty-state">
                <div className="tw-room-empty-text">열린 방이 없습니다</div>
                <div className="tw-room-empty-sub">방을 만들어 친구를 초대하세요</div>
              </div>
            : rooms.map(([id, r]) => {
                const count = Object.keys(r.players || {}).length;
                return (
                  <div key={id} className="tw-room-card" onClick={async () => {
                    try { await joinRoom(id, user, gs?.nickname); setRoomId(id); setScreen('multi_lobby'); }
                    catch (e) { showToast(e.message); }
                  }}>
                    <div className="tw-room-card-left">
                      <div className="tw-room-card-title">{r.title || '모험가의 방'}</div>
                      <div className="tw-room-card-sub">입장 가능</div>
                    </div>
                    <div className="tw-room-card-right">
                      <div className="tw-room-card-pips">
                        {[0,1,2,3].map(i => <div key={i} className={`tw-room-pip${i < count ? ' filled' : ''}`} />)}
                      </div>
                      <div className="tw-room-card-count">{count}/4명</div>
                    </div>
                  </div>
                );
              })
          }
        </div>

        {/* 방 만들기 버튼 */}
        <button className="tw-fab-create" onClick={() => setShowCreateModal(true)}>
          <span className="tw-fab-plus">＋</span>
          <span>방 만들기</span>
        </button>

        {/* 방 만들기 모달 */}
        {showCreateModal && (
          <div className="tw-modal-overlay" onClick={() => { setShowCreateModal(false); setNewRoomTitle(''); }}>
            <div className="tw-modal-card" onClick={e => e.stopPropagation()}>
              <div className="tw-modal-header">
                <div className="tw-modal-title">방 만들기</div>
                <div className="tw-modal-sub">함께 탑을 오를 방을 만드세요</div>
              </div>
              <input
                className="tw-modal-input"
                placeholder="방 제목 (비워두면 자동 생성)"
                value={newRoomTitle}
                onChange={e => setNewRoomTitle(e.target.value)}
                maxLength={20}
                autoFocus
                onKeyDown={e => e.key === 'Enter' && doCreate()}
              />
              <div className="tw-modal-btns">
                <button className="tw-modal-cancel" onClick={() => { setShowCreateModal(false); setNewRoomTitle(''); }}>취소</button>
                <button className="tw-modal-confirm" onClick={doCreate} disabled={isCreating}>
                  {isCreating ? '생성 중...' : '방 만들기'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // 방 로비 로딩
  if (screen === 'multi_lobby' && !roomData) {
    return (
      <div className="tower-screen">
        {toast && <div className="cw-toast">{toast}</div>}
        <div className="tower-midscreen-wrap">
          <div className="tower-section-title">방 불러오는 중...</div>
        </div>
      </div>
    );
  }

  // 방 로비 (롤 스타일)
  if (screen === 'multi_lobby' && roomData) {
    const players = roomData.players || {};
    const myUid   = user?.uid;
    const isHost  = roomData.hostUid === myUid;
    const me      = players[myUid];
    const sortedPlayers = Object.entries(players).sort(([,a],[,b]) => a.slot - b.slot);
    const allReady = sortedPlayers.length >= 2 && sortedPlayers.every(([,p]) => p.ready);

    // 카드 선택 바텀시트용 변수
    const activeGroup = charGroups[selCharIdx] || charGroups[0];
    const cards = activeGroup?.cards || [];
    const cardIdx = Math.min(selCardIdx, Math.max(0, cards.length - 1));
    const currentInst = cards[cardIdx];
    const currentDef = currentInst && CARDS.find(c => c.id === currentInst.id);

    return (
      <div className="tower-screen">
        {toast && <div className="cw-toast">{toast}</div>}
        <div className="tower-top-bar">
          <button className="tower-back-btn" onClick={async () => {
            await leaveRoom(roomId, myUid, roomData).catch(console.error);
            setRoomId(null); setRoomData(null); setLobbyPickPhase(null); setScreen('multi_list');
          }}>← 나가기</button>
          <span className="tower-screen-title">{roomData.title || '방'}</span>
          {isHost && <span style={{ fontSize: '0.65rem', color: '#fbbf24', fontWeight: 700 }}>방장</span>}
        </div>

        {/* ── 롤 스타일 카드 슬롯 ── */}
        <div className="tw-lol-board">
          {[0, 1, 2, 3].map(slot => {
            const entry = sortedPlayers.find(([,p]) => p.slot === slot);
            const [uid, p] = entry || [null, null];
            const def = p?.cardId ? CARDS.find(c => c.id === p.cardId) : null;
            const isMe = uid === myUid;
            return (
              <div key={slot} className="tw-lol-slot">
                <div
                  className={`tw-lol-card${isMe ? ' mine' : ''}${!uid ? ' empty-slot' : ''}`}
                  onClick={() => {
                    if (!isMe || !uid) return;
                    setSelCharIdx(0); setSelCardIdx(0); setSelCardSlideKey(k => k+1);
                    setLobbyPickPhase('card');
                  }}
                >
                  {uid ? (
                    def
                      ? <img src={`/${def.img}`} alt={def.name} />
                      : <div className="tw-lol-card-empty">
                          <span className="tw-lol-card-empty-icon">{isMe ? '👆' : '⏳'}</span>
                          <span className="tw-lol-card-empty-text">{isMe ? '탭하여\n카드 선택' : '선택 중...'}</span>
                        </div>
                  ) : (
                    <div className="tw-lol-card-empty">
                      <span className="tw-lol-card-empty-icon" style={{ opacity: 0.15 }}>＋</span>
                      <span className="tw-lol-card-empty-text" style={{ opacity: 0.3 }}>대기 중</span>
                    </div>
                  )}
                  {isMe && <div className="tw-lol-mine-badge">나</div>}
                </div>
                {uid && (
                  <>
                    <div className="tw-lol-name">{p.name}</div>
                    <div className={`tw-lol-ready${p.ready ? ' on' : ''}`}>
                      {p.ready ? '✓ 준비' : '대기 중'}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>

        {/* ── 버튼 ── */}
        <div className="tw-lobby-btns" style={{ marginTop: 'auto' }}>
          {me && (
            <button
              className={`tower-secondary-btn tw-ready-btn${me.ready ? ' active' : ''}`}
              disabled={!me.cardId}
              onClick={() => setPlayerReady(roomId, myUid, !me.ready)}
            >
              {me.ready ? '✓ 준비 완료' : me.cardId ? '준비하기' : '카드를 먼저 선택하세요'}
            </button>
          )}
          {isHost && (
            <button className="tower-primary-btn"
              disabled={!allReady}
              onClick={async () => {
                await setRoomStatus(roomId, 'job_select');
                setJobSlideIdx(0); setJobSlideDir('right');
                setScreen('multi_job_pick');
              }}>
              {allReady ? '게임 시작 →' : `준비 대기 중 (${sortedPlayers.filter(([,p])=>p.ready).length}/${sortedPlayers.length})`}
            </button>
          )}
        </div>

        {/* ── 카드 선택 바텀시트 ── */}
        {lobbyPickPhase === 'card' && (
          <div className="tw-lol-picker-overlay" onClick={() => setLobbyPickPhase(null)}>
            <div className="tw-lol-picker" onClick={e => e.stopPropagation()}>
              <div className="tw-lol-picker-handle" />
              <div className="tw-lol-picker-title">카드 선택</div>
              <div className="tw-char-tabs" style={{ marginBottom: 8 }}>
                {charGroups.map((g, i) => (
                  <button key={g.id}
                    className={`tw-char-tab${selCharIdx === i ? ' active' : ''}${g.cards.length === 0 ? ' empty' : ''}`}
                    onClick={() => { setSelCharIdx(i); setSelCardIdx(0); setSelCardSlideKey(k => k+1); }}>
                    {g.name}
                  </button>
                ))}
              </div>
              {cards.length === 0
                ? <div className="tower-empty">이 캐릭터의 카드를 보유하지 않았습니다</div>
                : <>
                    <div className="sk-slider-wrap">
                      <button className="wp-arrow" onClick={() => selCardGo((cardIdx - 1 + cards.length) % cards.length, 'left')}>‹</button>
                      <div className="sk-card-area">
                        {currentDef && (
                          <div key={selCardSlideKey} className={`sk-slide wp-slide-${selCardSlideDir}`} style={{ '--sc': '#fff' }}>
                            <img src={`/${currentDef.img}`} alt={currentDef.name} />
                            <div className="sk-slide-overlay">
                              <div className="sk-slide-name">{currentDef.name}</div>
                              <div className="sk-slide-desc">{currentDef.grade?.toUpperCase()}</div>
                            </div>
                          </div>
                        )}
                      </div>
                      <button className="wp-arrow" onClick={() => selCardGo((cardIdx + 1) % cards.length, 'right')}>›</button>
                    </div>
                    <div className="wp-dots">
                      {cards.map((_, i) => (
                        <div key={i} className={`wp-dot${i === cardIdx ? ' active' : ''}`}
                          onClick={() => selCardGo(i, i > cardIdx ? 'right' : 'left')} />
                      ))}
                    </div>
                    {currentInst && (
                      <button className="sk-pick-btn" style={{ background: 'linear-gradient(135deg,#7c3aed,#4c1d95)' }}
                        onClick={async () => {
                          const def2 = CARDS.find(c => c.id === currentInst.id);
                          await rtdbSetCard(roomId, myUid, currentInst.id, def2?.img ? `/${def2.img}` : null);
                          setLobbyPickPhase(null);
                        }}>
                        이 카드 선택
                      </button>
                    )}
                  </>
              }
            </div>
          </div>
        )}
      </div>
    );
  }

  // 직업 선택 (게임 시작 후 전원 동시)
  if (screen === 'multi_job_pick' && roomData) {
    const myUid = user?.uid;
    const currentJob = JOBS[jobSlideIdx];
    const alreadyPicked = !!(roomData.jobReady?.[myUid]);

    if (alreadyPicked) {
      return (
        <div className="tower-screen">
          <div className="tower-midscreen-wrap">
            <div className="tower-section-title">✓ 직업 선택 완료</div>
            <div className="tower-section-sub">다른 플레이어를 기다리는 중...</div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 12 }}>
              {Object.entries(roomData.players || {}).map(([uid, p]) => (
                <div key={uid} style={{ textAlign: 'center', fontSize: '0.72rem' }}>
                  <div style={{ color: roomData.jobReady?.[uid] ? '#4ade80' : 'var(--muted)' }}>
                    {roomData.jobReady?.[uid] ? '✓' : '⏳'}
                  </div>
                  <div style={{ color: 'var(--text)', fontWeight: 700 }}>{p.name}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="sk-screen">
        {toast && <div className="cw-toast">{toast}</div>}
        <div className="sk-header">
          <div className="sk-title">직업 선택</div>
          <div className="sk-sub">런에서 함께할 직업을 고르세요</div>
        </div>
        <div className="sk-slider-wrap">
          <button className="wp-arrow" onClick={() => jobGo((jobSlideIdx - 1 + JOBS.length) % JOBS.length, 'left')}>‹</button>
          <div className="sk-card-area">
            <div key={jobSlideKey} className={`sk-slide wp-slide-${jobSlideDir}`} style={{ '--sc': currentJob.color }}>
              <img src={currentJob.img} alt={currentJob.name} />
              <div className="sk-slide-overlay">
                <div className="sk-slide-name">{currentJob.name}</div>
                <div className="sk-slide-desc">{currentJob.desc}</div>
              </div>
            </div>
          </div>
          <button className="wp-arrow" onClick={() => jobGo((jobSlideIdx + 1) % JOBS.length, 'right')}>›</button>
        </div>
        <div className="wp-dots">
          {JOBS.map((_, i) => (
            <div key={i} className={`wp-dot${i === jobSlideIdx ? ' active' : ''}`}
              onClick={() => jobGo(i, i > jobSlideIdx ? 'right' : 'left')} />
          ))}
        </div>
        {renderJobInfo(currentJob)}
        <button className="sk-pick-btn"
          style={{ background: `linear-gradient(135deg, ${currentJob.color}, ${currentJob.color}99)` }}
          onClick={async () => {
            await markJobReady(roomId, myUid, currentJob.id).catch(console.error);
          }}>
          {currentJob.name} 선택
        </button>
      </div>
    );
  }

  // 멀티 전투
  if (screen === 'multi_battle' && roomData?.battle) {
    const battle   = roomData.battle;
    const players  = roomData.players || {};
    const myUid    = user?.uid;
    const isHost   = roomData.hostUid === myUid;
    const myPs     = battle.playerStates?.[myUid] || {};
    const myDef    = players[myUid]?.cardId ? CARDS.find(c => c.id === players[myUid].cardId) : null;
    const enemy    = battle.enemy || {};
    const picks    = battle.picks || {};
    const phase    = battle.phase;
    const ePct     = Math.max(0, (enemy.hp / enemy.maxHp) * 100);
    const eCol     = ePct > 60 ? '#4ade80' : ePct > 30 ? '#fbbf24' : '#f87171';
    const myPct    = Math.max(0, (myPs.hp / myPs.maxHp) * 100);
    const myCol    = myPct > 60 ? '#4ade80' : myPct > 30 ? '#fbbf24' : '#f87171';
    const eCardDef = battle.eCard ? getCard(battle.eCard) : null;
    const myPickDef= picks[myUid] ? getCard(picks[myUid]) : null;
    const myJob    = myPs.job ? JOBS.find(j => j.id === myPs.job) : null;

    const teammates = Object.entries(players).filter(([uid]) => uid !== myUid);
    const sortedFightUids = Object.keys(battle.playedCards || {})
      .sort((a, b) => (players[a]?.slot || 0) - (players[b]?.slot || 0));

    // 멀티 사이 화면 (stat / skill / shop)
    if (phase === 'between' && !(battle.betweenReady?.[myUid])) {
      if (!multiBetweenScreen) {
        // 초기화 및 stat으로
        if (!multiBetweenRun) {
          const floor = battle.floor || 1;
          const choices = pickSkillChoices(myPs.skills || [], myPs.job);
          const isBossFloor2 = [5,10,15,20,25].includes(floor);
          const basePlayer = (() => {
            if (!myPs.preBuffStats) return myPs;
            const ps = myPs.preBuffStats;
            const hpRatio = (myPs.hp || 1) / (myPs.maxHp || 1);
            return { ...myPs, atk: ps.atk, def: ps.def, maxHp: ps.maxHp, hp: Math.min(ps.maxHp, Math.ceil(ps.maxHp * hpRatio)), preBuffStats: null };
          })();
          setMultiBetweenRun({ player: basePlayer, floor, gold: basePlayer.gold || 0, pendingSkillChoices: choices, bossHealGained: battle.bossHealGained || 0, pendingBuffs: {}, skills: basePlayer.skills || [], pendingStatPoints: isBossFloor2 ? 10 : 5 });
          setMultiBetweenStatDraft({ hp: 0, atk: 0, def: 0 });
          setMultiBetweenScreen('stat');
        }
        return <div className="tower-screen"><div className="tower-midscreen-wrap"><div className="tower-section-title">불러오는 중...</div></div></div>;
      }

      if (multiBetweenScreen === 'stat' && multiBetweenRun) {
        const mbr = multiBetweenRun;
        const statPoints2 = multiBetweenRun?.pendingStatPoints ?? 5;
        const rem2 = statPoints2 - (multiBetweenStatDraft.hp + multiBetweenStatDraft.atk + multiBetweenStatDraft.def);
        return (
          <div className="tower-screen">
            <div className="tower-midscreen-wrap">
              <div className="tower-section-title">{mbr.floor}층 클리어!</div>
              <div className="tw-gold-badge">💰 {mbr.gold} 골드</div>
              {mbr.bossHealGained > 0 && <div className="tower-boss-heal">보스 보상: +{mbr.bossHealGained} HP 회복</div>}
              <div className="tower-section-sub">스탯 포인트 {statPoints2}점을 배분하세요{statPoints2 > 5 ? ' (보스 보너스!)' : ''}</div>
              <div className="tower-pts-remaining">남은 포인트: <strong>{rem2}</strong></div>
              {[{key:'hp',label:'체력',note:'1pt→+10HP'},{key:'atk',label:'공격력',note:'1pt→+1ATK'},{key:'def',label:'방어력',note:'1pt→+1DEF'}].map(({key,label,note})=>(
                <div key={key} className="tower-stat-assign-row">
                  <span className="tower-stat-assign-label">{label}</span>
                  <span className="tower-stat-assign-note">{note}</span>
                  <div className="tower-stepper">
                    <button onClick={()=>setMultiBetweenStatDraft(d=>({...d,[key]:Math.max(0,d[key]-1)}))}>−</button>
                    <span>{multiBetweenStatDraft[key]}</span>
                    <button onClick={()=>setMultiBetweenStatDraft(d=>({...d,[key]:d[key]+1}))} disabled={rem2<=0}>+</button>
                  </div>
                </div>
              ))}
              <button className="tower-primary-btn" disabled={rem2>0} onClick={()=>{
                setMultiBetweenRun(prev=>({...prev,player:{...prev.player,maxHp:prev.player.maxHp+multiBetweenStatDraft.hp*10,hp:prev.player.hp+multiBetweenStatDraft.hp*10,atk:prev.player.atk+multiBetweenStatDraft.atk,def:prev.player.def+multiBetweenStatDraft.def}}));
                setMultiBetweenStatDraft({hp:0,atk:0,def:0});
                setMultiBetweenScreen('skill');
              }}>{rem2>0?`${rem2}pt 남음`:'확인'}</button>
            </div>
          </div>
        );
      }

      if (multiBetweenScreen === 'skill' && multiBetweenRun) {
        const mbr = multiBetweenRun;
        const choices2 = mbr.pendingSkillChoices || [];
        const isFull2 = (mbr.skills||[]).length >= maxSkills(myPs.job);
        const safeIdx2 = Math.min(multiBetweenSkillIdx, choices2.length - 1);
        const cur2 = choices2[safeIdx2];
        const mbGo = (idx, dir) => { setMultiBetweenSkillDir(dir); setMultiBetweenSkillKey(k=>k+1); setMultiBetweenSkillIdx(idx); };
        if (multiBetweenPendingSkill) {
          const repCard = getCard((mbr.skills||[])[Math.min(multiBetweenSkillIdx, (mbr.skills||[]).length-1)]);
          return (
            <div className="sk-screen">
              <div className="sk-header"><div className="sk-title">스킬 교체</div><div className="sk-sub">버릴 스킬 선택</div></div>
              <div className="sk-new-preview"><div className="sk-new-label">추가될 스킬</div><div className="sk-badge-card" style={{'--sc':multiBetweenPendingSkill.color}}>{multiBetweenPendingSkill.img?<img src={multiBetweenPendingSkill.img} alt=""/>:<span>{multiBetweenPendingSkill.name}</span>}</div></div>
              <div className="sk-slider-wrap">
                <button className="wp-arrow" onClick={()=>mbGo((multiBetweenSkillIdx-1+(mbr.skills||[]).length)%(mbr.skills||[]).length,'left')}>‹</button>
                <div className="sk-card-area"><div key={multiBetweenSkillKey} className={`sk-slide wp-slide-${multiBetweenSkillDir}`} style={{'--sc':repCard.color}}>{repCard.img?<img src={repCard.img} alt=""/>:<div className="sk-slide-noimg">{repCard.name}</div>}<div className="sk-slide-overlay"><div className="sk-slide-name">{repCard.name}</div><div className="sk-slide-desc">{repCard.desc}</div></div></div></div>
                <button className="wp-arrow" onClick={()=>mbGo((multiBetweenSkillIdx+1)%(mbr.skills||[]).length,'right')}>›</button>
              </div>
              <div className="wp-dots">{(mbr.skills||[]).map((_,i)=><div key={i} className={`wp-dot${i===multiBetweenSkillIdx?' active':''}`} onClick={()=>mbGo(i,i>multiBetweenSkillIdx?'right':'left')}/>)}</div>
              <button className="sk-pick-btn" style={{background:'linear-gradient(135deg,#dc2626,#7f1d1d)'}} onClick={()=>{const id=(mbr.skills||[])[multiBetweenSkillIdx];setMultiBetweenRun(prev=>({...prev,skills:prev.skills.map(s=>s===id?multiBetweenPendingSkill.id:s)}));setMultiBetweenPendingSkill(null);setMultiBetweenSkillIdx(0);setMultiBetweenScreen('shop');}}>버리고 교체</button>
              <button className="sk-skip-btn" onClick={()=>{setMultiBetweenPendingSkill(null);setMultiBetweenSkillIdx(0);setMultiBetweenScreen('shop');}}>건너뛰기</button>
            </div>
          );
        }
        return (
          <div className="sk-screen">
            <div className="sk-header"><div className="sk-title">스킬 카드 획득</div><div className="sk-sub">{isFull2?'교체합니다':'1장 선택'}</div></div>
            {cur2&&(<><div className="sk-slider-wrap"><button className="wp-arrow" onClick={()=>mbGo((safeIdx2-1+choices2.length)%choices2.length,'left')}>‹</button><div className="sk-card-area"><div key={multiBetweenSkillKey} className={`sk-slide wp-slide-${multiBetweenSkillDir}${cur2.job?' sk-slide-exclusive':''}`} style={{'--sc':cur2.color}}>{cur2.img?<img src={cur2.img} alt=""/>:<div className="sk-slide-noimg">{cur2.name}</div>}<div className="sk-slide-overlay"><div className="sk-slide-name">{cur2.name}</div><div className="sk-slide-desc">{cur2.desc}</div></div></div></div><button className="wp-arrow" onClick={()=>mbGo((safeIdx2+1)%choices2.length,'right')}>›</button></div><div className="wp-dots">{choices2.map((_,i)=><div key={i} className={`wp-dot${i===safeIdx2?' active':''}`} onClick={()=>mbGo(i,i>safeIdx2?'right':'left')}/>)}</div><button className="sk-pick-btn" style={{background:`linear-gradient(135deg,${cur2.color},${cur2.color}99)`}} onClick={()=>{setMultiBetweenSkillIdx(0);isFull2?setMultiBetweenPendingSkill(cur2):setMultiBetweenRun(prev=>({...prev,skills:[...prev.skills,cur2.id]}));if(!isFull2)setMultiBetweenScreen('shop');}}>이 스킬 선택</button></>)}
            <button className="sk-skip-btn" onClick={()=>{setMultiBetweenSkillIdx(0);setMultiBetweenScreen('shop');}}>건너뛰기</button>
          </div>
        );
      }

      if (multiBetweenScreen === 'shop' && multiBetweenRun) {
        const mbr = multiBetweenRun;
        return (
          <div className="tower-screen">
            <div className="tower-midscreen-wrap">
              <div className="tower-section-title">🧙 마녀의 상점</div>
              <div className="tower-witch-gold">💰 {mbr.gold}</div>
              <div className="tower-shop-grid">
                {SHOP_ITEMS.map(item => {
                  const bought = !!(mbr.pendingBuffs?.[item.id]) && item.id !== 'potion';
                  const canAfford = mbr.gold >= item.price;
                  return (
                    <div key={item.id} className={`tower-shop-item${bought?' bought':''}${!canAfford&&!bought?' cant-afford':''}`}>
                      <div className="tower-shop-icon">{item.icon}</div>
                      <div className="tower-shop-name">{item.name}</div>
                      <div className="tower-shop-desc">{item.desc}</div>
                      <button className="tower-shop-btn" disabled={bought||!canAfford} onClick={()=>{
                        setMultiBetweenRun(prev=>{
                          let s={...prev,gold:prev.gold-item.price};
                          if(item.id==='potion'){const h=Math.floor(prev.player.maxHp*0.3);s={...s,player:{...prev.player,hp:Math.min(prev.player.maxHp,prev.player.hp+h)}};}
                          else s={...s,pendingBuffs:{...prev.pendingBuffs,[item.id]:true}};
                          return s;
                        });
                      }}>{bought?'구매완료':`💰 ${item.price}`}</button>
                    </div>
                  );
                })}
              </div>
              <button className="tower-primary-btn" onClick={async () => {
                // 최종 playerState 계산 및 RTDB에 기록
                const buffs = mbr.pendingBuffs || {};
                let p = { ...mbr.player };
                if (buffs.atk_buf) p = { ...p, atk: Math.floor(p.atk * 1.5) };
                if (buffs.def_buf) p = { ...p, def: Math.floor(p.def * 1.5) };
                if (buffs.hp_buf) { const nm = Math.floor(p.maxHp * 1.5); p = { ...p, maxHp: nm, hp: Math.min(nm, p.hp + (nm - p.maxHp)) }; }
                const hasBuffs2 = buffs.atk_buf || buffs.def_buf || buffs.hp_buf;
                const preBuffStats2 = hasBuffs2 ? { atk: mbr.player.atk, def: mbr.player.def, maxHp: mbr.player.maxHp } : null;
                const newCritBonus = (myPs.critBonus || 0) + (myPs.job === 'warrior' ? 0.01 : 0);
                const newPs = { ...myPs, ...p, skills: mbr.skills, skillsUsed: {}, basicUsed: { ...EMPTY_BASIC_USED }, gold: mbr.gold, pendingBuffs: {}, preBuffStats: preBuffStats2, pCharge: false, pStunned: false, rogueReady: false, critBonus: newCritBonus };
                await markBetweenReady(roomId, myUid, newPs).catch(console.error);
                setMultiBetweenScreen(null); setMultiBetweenRun(null);
              }}>다음 층으로 →</button>
            </div>
          </div>
        );
      }
      return <div className="tower-screen"><div className="tower-midscreen-wrap"><div className="tower-section-title">준비 완료! 다른 플레이어 대기 중...</div></div></div>;
    }

    if (phase === 'between' && battle.betweenReady?.[myUid]) {
      return <div className="tower-screen"><div className="tower-midscreen-wrap"><div className="tower-section-title">대기 중...</div><div className="tower-section-sub">다른 플레이어를 기다리고 있습니다</div></div></div>;
    }

    if (phase === 'game_over' || myPs.hp <= 0) {
      return (
        <div className="tower-screen">
          <div className="tower-midscreen-wrap">
            <div className="tower-section-title" style={{ color: '#fbbf24' }}>{battle.maxFloor || 0}층 클리어</div>
            <div className="tower-result-stats">
              <div className="tower-result-row"><span>최고 층</span><strong>{battle.maxFloor || 0}층</strong></div>
            </div>
            <div className="tower-intro-btns">
              <button className="tower-primary-btn" onClick={async () => {
                await leaveRoom(roomId, myUid, roomData).catch(console.error);
                setRoomId(null); setRoomData(null); setScreen('intro');
              }}>처음으로</button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="tw-battle-wrap">
        {toast && <div className="cw-toast">{toast}</div>}

        {/* 카드 확대 미리보기 (멀티) */}
        {previewCard?.multi && phase === 'pick' && (() => {
          const pc = getCard(previewCard.id);
          const isRageBlocked = previewCard.id === 'rage' && myPs.hp <= Math.floor(myPs.maxHp * 0.5);
          return (
            <div className="tw-preview-overlay" onClick={() => setPreviewCard(null)}>
              <div className="tw-preview-wrap" onClick={e => e.stopPropagation()}>
                <div className="tw-preview-card" style={{ borderColor: pc.color }}>
                  {pc.img
                    ? <img src={pc.img} alt={pc.name} className="tw-hcard-img-full" />
                    : <><div className="tw-hcard-strip" style={{ background: pc.color }} /><div className="tw-hcard-name" style={{ color: pc.color }}>{pc.name}</div></>
                  }
                </div>
                <div className="tw-preview-info">
                  <div className="tw-preview-name" style={{ color: pc.color }}>{pc.name}</div>
                  <div className="tw-preview-desc">{pc.desc}</div>
                  {isRageBlocked && <div style={{ color: '#ef4444', fontSize: '0.78rem', marginTop: 6, fontWeight: 700 }}>체력이 부족해 사망합니다</div>}
                </div>
                <div className="tw-preview-btns">
                  <button className="tw-preview-cancel-btn" onClick={() => setPreviewCard(null)}>취소</button>
                  <button className="tw-preview-play-btn"
                    style={{ background: isRageBlocked ? '#aaa' : `linear-gradient(135deg, ${pc.color}cc, ${pc.color})`, cursor: isRageBlocked ? 'not-allowed' : 'pointer' }}
                    disabled={isRageBlocked}
                    onClick={() => {
                      if (isRageBlocked) return;
                      setPreviewCard(null);
                      setMultiPicked(previewCard.id);
                      submitPick(roomId, myUid, previewCard.id).catch(e => { showToast('카드 제출 실패: ' + e.message); setMultiPicked(null); });
                    }}>
                    사용
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

        {/* 보스 경고 오버레이 */}
        {bossWarning && (
          <div className="tw-boss-warning">
            <div className="tw-boss-warning-text">⚠ WARNING ⚠</div>
          </div>
        )}

        {/* 채팅 입력 오버레이 */}
        {showChatInput && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 199 }}
            onClick={() => { setShowChatInput(false); setChatInput(''); }} />
        )}
        {showChatInput && (
          <div style={{ position: 'fixed', bottom: 72, left: 0, right: 0, display: 'flex', gap: 6, padding: '0 12px', zIndex: 200 }}>
            <input
              autoFocus
              maxLength={30}
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') handleSendChat(e); if (e.key === 'Escape') { setShowChatInput(false); setChatInput(''); } }}
              placeholder="메시지 입력 (최대 30자)"
              style={{ flex: 1, borderRadius: 20, border: '1px solid rgba(167,139,250,0.5)', background: 'rgba(10,10,20,0.95)', color: 'white', padding: '9px 14px', fontSize: '0.85rem', outline: 'none' }}
            />
            <button onPointerDown={handleSendChat}
              style={{ background: 'linear-gradient(135deg,#7c3aed,#4c1d95)', color: 'white', border: 'none', borderRadius: 20, padding: '9px 16px', fontWeight: 700, fontSize: '0.82rem' }}>
              전송
            </button>
            <button onClick={() => { setShowChatInput(false); setChatInput(''); }}
              style={{ background: 'rgba(255,255,255,0.1)', color: 'white', border: 'none', borderRadius: 20, padding: '9px 12px', fontSize: '0.82rem' }}>
              ✕
            </button>
          </div>
        )}

        {/* 팀원 스탯 모달 */}
        {viewingPlayerUid && (() => {
          const vUid  = viewingPlayerUid;
          const vPs   = battle.playerStates?.[vUid] || {};
          const vP    = players[vUid] || {};
          const vDef  = vP.cardId ? CARDS.find(c => c.id === vP.cardId) : null;
          const vJob  = vPs.job ? JOBS.find(j => j.id === vPs.job) : null;
          const vPct  = Math.max(0, (vPs.hp || 0) / (vPs.maxHp || 1) * 100);
          const vCol  = vPct > 60 ? '#4ade80' : vPct > 30 ? '#fbbf24' : '#f87171';
          const isMe  = vUid === myUid;
          return (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.72)', zIndex: 150, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              onClick={() => setViewingPlayerUid(null)}>
              <div style={{ background: 'var(--card)', borderRadius: 20, padding: '20px 18px', width: 'min(320px, 90vw)', display: 'flex', flexDirection: 'column', gap: 14, position: 'relative' }}
                onClick={e => e.stopPropagation()}>
                <button onClick={() => setViewingPlayerUid(null)}
                  style={{ position: 'absolute', top: 12, right: 14, background: 'none', border: 'none', color: 'var(--muted)', fontSize: '1.1rem', cursor: 'pointer' }}>✕</button>

                {/* 캐릭터 카드 + 이름 */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  {vDef && (
                    <img src={`/${vDef.img}`} alt={vDef.name}
                      style={{ width: 72, height: 94, objectFit: 'cover', borderRadius: 12, border: '2px solid rgba(255,255,255,0.15)', flexShrink: 0 }} />
                  )}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontWeight: 900, fontSize: '1rem', color: 'var(--text)' }}>{vP.name}</span>
                      {isMe && <span style={{ fontSize: '0.6rem', background: '#7c3aed', color: 'white', padding: '1px 6px', borderRadius: 6, fontWeight: 700 }}>나</span>}
                    </div>
                    {vJob && <span style={{ fontSize: '0.72rem', color: vJob.color, fontWeight: 700 }}>{vJob.name}</span>}
                    {vPs.hp <= 0 && <span style={{ fontSize: '0.7rem', color: '#f87171', fontWeight: 700 }}>사망</span>}
                  </div>
                </div>

                {/* HP 바 */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem' }}>
                    <span style={{ color: 'var(--muted)', fontWeight: 700 }}>HP</span>
                    <span style={{ color: vCol, fontWeight: 900 }}>{vPs.hp} / {vPs.maxHp}</span>
                  </div>
                  <div style={{ height: 8, background: 'rgba(255,255,255,0.1)', borderRadius: 99, overflow: 'hidden' }}>
                    <div style={{ width: `${vPct}%`, height: '100%', background: vCol, borderRadius: 99, transition: 'width 0.5s' }} />
                  </div>
                </div>

                {/* ATK / DEF */}
                <div style={{ display: 'flex', gap: 10 }}>
                  {[['공격력', vPs.atk, '#ef4444'], ['방어력', vPs.def, '#3b82f6']].map(([label, val, color]) => (
                    <div key={label} style={{ flex: 1, background: 'rgba(255,255,255,0.05)', borderRadius: 12, padding: '8px 0', textAlign: 'center' }}>
                      <div style={{ fontSize: '0.62rem', color: 'var(--muted)', marginBottom: 2 }}>{label}</div>
                      <div style={{ fontSize: '1.1rem', fontWeight: 900, color, fontFamily: 'Nunito' }}>{val ?? '—'}</div>
                    </div>
                  ))}
                  <div style={{ flex: 1, background: 'rgba(255,255,255,0.05)', borderRadius: 12, padding: '8px 0', textAlign: 'center' }}>
                    <div style={{ fontSize: '0.62rem', color: 'var(--muted)', marginBottom: 2 }}>골드</div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 900, color: '#fbbf24', fontFamily: 'Nunito' }}>💰{vPs.gold ?? 0}</div>
                  </div>
                </div>

                {/* 스킬 카드 */}
                <div>
                  <div style={{ fontSize: '0.68rem', color: 'var(--muted)', fontWeight: 700, marginBottom: 6 }}>스킬 ({(vPs.skills || []).length}/3)</div>
                  {(vPs.skills || []).length === 0
                    ? <div style={{ fontSize: '0.72rem', color: 'var(--muted)', textAlign: 'center', padding: '6px 0' }}>보유 스킬 없음</div>
                    : (
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {(vPs.skills || []).map(sid => {
                          const sc = getCard(sid);
                          const used = !!(vPs.skillsUsed?.[sid]);
                          return (
                            <div key={sid} style={{ display: 'flex', alignItems: 'center', gap: 5, background: used ? 'rgba(255,255,255,0.04)' : `${sc.color}22`, border: `1px solid ${used ? 'rgba(255,255,255,0.1)' : sc.color + '66'}`, borderRadius: 10, padding: '5px 8px', opacity: used ? 0.45 : 1 }}>
                              {sc.img && <img src={sc.img} alt={sc.name} style={{ width: 22, height: 29, objectFit: 'cover', borderRadius: 4 }} />}
                              <div>
                                <div style={{ fontSize: '0.65rem', fontWeight: 700, color: sc.color }}>{sc.name}</div>
                                {used && <div style={{ fontSize: '0.55rem', color: 'var(--muted)' }}>사용됨</div>}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )
                  }
                </div>

                {/* 버프 상태 */}
                {(vPs.pCharge || vPs.pStunned) && (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {vPs.pCharge    && <span className="tw-cbuff">차지↑</span>}
                    {vPs.pStunned   && <span className="tw-cbuff stun">기절</span>}
                  </div>
                )}

                {/* 채팅 버튼 (내 캐릭터일 때만) */}
                {isMe && (
                  <button onClick={() => { setViewingPlayerUid(null); setShowChatInput(true); setChatInput(''); }}
                    style={{ background: 'linear-gradient(135deg,#7c3aed,#4c1d95)', color: 'white', border: 'none', borderRadius: 12, padding: '10px 0', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' }}>
                    채팅
                  </button>
                )}
              </div>
            </div>
          );
        })()}

        {/* 층 바 */}
        <div className="tw-floor-bar">
          <span className={`tw-floor-badge${enemy.isBoss ? ' boss' : ''}`}>{enemy.isBoss ? '⚠ ' : ''}{battle.floor}층</span>
          <span className="tw-deck-info"><span className="tw-gold-chip">💰{myPs.gold || 0}</span> &nbsp;스킬 {(myPs.skills || []).length}/{maxSkills(myPs.job)}</span>
          <span className="tw-deck-info" style={{ color: '#a855f7', fontSize: '0.65rem', fontWeight: 700 }}>멀티</span>
        </div>

        {/* 아레나: 왼쪽=팀, 오른쪽=적 */}
        <div className="tw-multi-arena-lr">
          {/* 왼쪽: 팀 플레이어들 */}
          <div className="tw-multi-team-side" data-count={Object.keys(players).length}>
            {/* 내 캐릭터 */}
            {(() => {
              const myECard = phase === 'result' ? battle.eCardsPerPlayer?.[myUid] : null;
              const myECardDef = myECard ? getCard(myECard) : null;
              return (
                <div className={`tw-multi-mini${myPs.hp <= 0 ? ' dead' : ''}${multiPShakes[myUid] ? ' tw-shake' : ''}`} style={{ position: 'relative' }}>
                  {multiPFloats[myUid] && (
                    <div key={multiPFloats[myUid].k} className={`tw-dmg-float-mini ${multiPFloats[myUid].type}`}>
                      {multiPFloats[myUid].type === 'dmg' ? `-${multiPFloats[myUid].val}` : `+${multiPFloats[myUid].val}`}
                    </div>
                  )}
                  {chatBubbles[myUid] && <div className="tw-chat-bubble">{chatBubbles[myUid]}</div>}
                  <div className="tw-mini-img-wrap" style={{ cursor: 'pointer' }}
                    onClick={() => setViewingPlayerUid(myUid)}>
                    {myDef && <img src={`/${myDef.img}`} alt={myDef.name} className={`tw-mini-img${multiLunges[myUid] ? ' tw-lunge' : ''}`} />}
                  </div>
                  <div className="tw-mini-info">
                    <span className="tw-mini-name">{players[myUid]?.name || '나'} <span style={{color:'#a78bfa',fontSize:'0.55rem'}}>나</span></span>
                    <div className="tw-combatant-hpbar"><div style={{width:`${myPct}%`,background:myCol,height:'100%',borderRadius:'99px',transition:'width 0.5s'}}/></div>
                    <span className="tw-mini-hp" style={{color:myCol}}>{myPs.hp}/{myPs.maxHp}</span>
                    <div className="tw-mini-buffs">
                      {myJob && <span className="tw-cbuff" style={{color:myJob.color,background:`${myJob.color}28`,fontSize:'0.5rem'}}>{myJob.name}</span>}
                      {myPs.job === 'warrior' && <span className="tw-cbuff" style={{color:'#ef4444',background:'rgba(239,68,68,0.16)',fontSize:'0.5rem'}}>크리 {Math.round((0.15 + (myPs.critBonus || 0)) * 100)}%</span>}
                      {myPs.pCharge && <span className="tw-cbuff" style={{fontSize:'0.5rem'}}>차지↑</span>}
                      {myPs.pStunned && <span className="tw-cbuff stun" style={{fontSize:'0.5rem'}}>기절</span>}
                      {myECardDef && <span className="tw-cbuff" style={{color:myECardDef.color,background:`${myECardDef.color}28`,fontSize:'0.5rem'}}>적:{myECardDef.name}</span>}
                    </div>
                    {phase === 'pick' && <span className="tw-mini-pick-status">{picks[myUid] ? '✓' : '...'}</span>}
                  </div>
                </div>
              );
            })()}
            {/* 팀원들 */}
            {teammates.map(([uid, p]) => {
              const ps2 = battle.playerStates?.[uid] || {};
              const def2 = p.cardId ? CARDS.find(c => c.id === p.cardId) : null;
              const pct2 = Math.max(0, (ps2.hp||0) / (ps2.maxHp||1) * 100);
              const col2 = pct2 > 60 ? '#4ade80' : pct2 > 30 ? '#fbbf24' : '#f87171';
              const eCard2 = phase === 'result' ? battle.eCardsPerPlayer?.[uid] : null;
              const eCardDef2 = eCard2 ? getCard(eCard2) : null;
              return (
                <div key={uid} className={`tw-multi-mini${ps2.hp <= 0 ? ' dead' : ''}${multiPShakes[uid] ? ' tw-shake' : ''}`} style={{ position: 'relative' }}>
                  {multiPFloats[uid] && (
                    <div key={multiPFloats[uid].k} className={`tw-dmg-float-mini ${multiPFloats[uid].type}`}>
                      {multiPFloats[uid].type === 'dmg' ? `-${multiPFloats[uid].val}` : `+${multiPFloats[uid].val}`}
                    </div>
                  )}
                  {chatBubbles[uid] && <div className="tw-chat-bubble">{chatBubbles[uid]}</div>}
                  <div className="tw-mini-img-wrap" style={{ cursor: 'pointer' }}
                    onClick={() => setViewingPlayerUid(uid)}>
                    {def2 && <img src={`/${def2.img}`} alt={p.name} className={`tw-mini-img${multiLunges[uid] ? ' tw-lunge' : ''}`} />}
                  </div>
                  <div className="tw-mini-info">
                    <span className="tw-mini-name">{p.name}</span>
                    <div className="tw-combatant-hpbar"><div style={{width:`${pct2}%`,background:col2,height:'100%',borderRadius:'99px',transition:'width 0.5s'}}/></div>
                    <span className="tw-mini-hp" style={{color:col2}}>{ps2.hp}/{ps2.maxHp}</span>
                    <div className="tw-mini-buffs">
                      {(() => { const j = JOBS.find(jb => jb.id === ps2.job); return j ? <span className="tw-cbuff" style={{color:j.color,background:`${j.color}28`,fontSize:'0.5rem'}}>{j.name}</span> : null; })()}
                      {ps2.pCharge && <span className="tw-cbuff" style={{fontSize:'0.5rem'}}>차지↑</span>}
                      {ps2.pStunned && <span className="tw-cbuff stun" style={{fontSize:'0.5rem'}}>기절</span>}
                      {eCardDef2 && <span className="tw-cbuff" style={{color:eCardDef2.color,background:`${eCardDef2.color}28`,fontSize:'0.5rem'}}>적:{eCardDef2.name}</span>}
                    </div>
                    {phase === 'pick' && <span className="tw-mini-pick-status">{picks[uid] ? '✓' : '...'}</span>}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="tw-multi-arena-vs">VS</div>

          {/* 오른쪽: 적 (싱글플레이와 동일) */}
          <div className={`tw-combatant${enemy.isBoss ? ' boss-combatant' : ''}`} style={{ flex: 1, position: 'relative' }}>
            <img src={enemy.img} alt={enemy.name} className={`tw-combatant-img${enemy.hp <= 0 ? ' dead' : ''}${multiEShake ? ' tw-shake' : ''}${enemy.isBoss ? ' boss-img' : ''}`} />
            {multiEFloat && <div key={multiEFloat.k} className={`tw-dmg-float ${multiEFloat.type}`}>{multiEFloat.type === 'dmg' ? `-${multiEFloat.val}` : `+${multiEFloat.val}`}</div>}
            <div className="tw-combatant-overlay">
              <div className="tw-combatant-name">{enemy.name}</div>
              <div className="tw-combatant-hp-row">
                <span style={{color:eCol,fontFamily:'Nunito',fontWeight:900,fontSize:'0.85rem'}}>{enemy.hp}</span>
                <span style={{color:'rgba(255,255,255,0.45)',fontSize:'0.62rem'}}>/{enemy.maxHp}</span>
              </div>
              <div className="tw-combatant-hpbar"><div style={{width:`${ePct}%`,background:eCol,height:'100%',borderRadius:'99px',transition:'width 0.6s ease'}}/></div>
              <div className="tw-combatant-stats"><span>⚔{enemy.atk}</span><span>🛡{enemy.def}</span></div>
            </div>
          </div>
        </div>

        {/* ── 순차 전투 reveal 패널 ── */}
        {phase === 'result' && fightStep >= 0 && (() => {
          const curUid = sortedFightUids[fightStep];
          if (!curUid) return null;
          const pCardId     = battle.playedCards?.[curUid];
          const eCardId     = battle.eCardsPerPlayer?.[curUid];
          const pCardDef    = pCardId ? getCard(pCardId) : null;
          const eCardReveal = eCardId ? getCard(eCardId) : null;
          const curName     = curUid === myUid ? '나' : (players[curUid]?.name || '플레이어');
          const curCharDef  = players[curUid]?.cardId ? CARDS.find(c => c.id === players[curUid].cardId) : null;
          const isMe        = curUid === myUid;
          return (
            <div key={fightStep} className="tw-lounge" style={{ marginTop: 4 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
                {/* 현재 차례 플레이어 캐릭터 카드 */}
                {curCharDef && (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, minWidth: 50, flexShrink: 0 }}>
                    <img
                      src={`/${curCharDef.img}`}
                      alt={curName}
                      style={{
                        width: 46, height: 60, objectFit: 'cover', borderRadius: 8,
                        border: `2px solid ${isMe ? '#a78bfa' : 'rgba(255,255,255,0.35)'}`,
                        boxShadow: isMe ? '0 0 8px rgba(167,139,250,0.5)' : 'none',
                      }}
                    />
                    <span style={{ fontSize: '0.55rem', fontWeight: 700, color: isMe ? '#a78bfa' : 'rgba(255,255,255,0.55)' }}>
                      {curName}
                    </span>
                  </div>
                )}
                {/* 카드 대결 */}
                <div style={{ flex: 1 }}>
                  <div className="tw-lounge-cards">
                    <div className="tw-reveal-card tw-drop-p" style={{ borderColor: pCardDef?.color || 'rgba(255,255,255,0.3)' }}>
                      {pCardDef?.img
                        ? <img src={pCardDef.img} alt={pCardDef.name} className="tw-hcard-img-full" />
                        : <div className="tw-hcard-name" style={{ color: pCardDef?.color }}>{pCardDef?.name ?? '—'}</div>}
                    </div>
                    <div className="tw-lounge-vs">VS</div>
                    <div className={`tw-reveal-card tw-drop-e${fightStepFlipped ? '' : ' tw-reveal-hidden'}`}
                         style={fightStepFlipped ? { borderColor: eCardReveal?.color || 'rgba(255,255,255,0.3)' } : {}}>
                      {fightStepFlipped
                        ? (eCardReveal?.img
                            ? <img src={eCardReveal.img} alt={eCardReveal.name} className="tw-hcard-img-full" />
                            : <div className="tw-hcard-name" style={{ color: eCardReveal?.color }}>{eCardReveal?.name ?? '—'}</div>)
                        : <span className="tw-back-sym">♠</span>}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        {/* 전투 완료 후 로그 & 결과 */}
        {phase === 'result' && fightStep === -2 && battle.turnLog && logRevealIdx > 0 && (
          <div className="tw-turn-log" style={{ maxHeight: 120, overflowY: 'auto' }}>
            {battle.turnLog.slice(0, logRevealIdx).map((l, i) => {
              const cls = l.includes('데미지')||l.includes('피해')||l.includes('반격') ? 'dmg' : l.includes('회복')||l.includes('흡수') ? 'heal' : l.includes('방어')||l.includes('무효')||l.includes('회피') ? 'def' : l.includes('실패')||l.includes('기절') ? 'bad' : '';
              return <div key={i} className={`tw-log-line ${cls} tw-log-pop`}>{l}</div>;
            })}
          </div>
        )}

        {/* 결과 버튼 (시퀀스 완료 후에만) */}
        {phase === 'result' && fightStep === -2 && (
          multiNextClicked
            ? <div className="tw-multi-waiting">다른 플레이어 대기 중...</div>
            : <button className="tw-next-btn"
                style={enemy.hp <= 0 ? { background: 'linear-gradient(135deg,#fbbf24,#d97706)', color: '#000' } : {}}
                onClick={() => {
                  if (enemy.hp <= 0) {
                    const isBossFloor = [5,10,15,20,25].includes(battle.floor);
                    const bossHeal = isBossFloor ? Math.floor(myPs.maxHp * 0.2) : 0;
                    const newPs = { ...myPs, hp: Math.min(myPs.maxHp, myPs.hp + bossHeal), gold: (myPs.gold || 0) + 10 };
                    const choices = pickSkillChoices(myPs.skills || [], myPs.job);
                    setMultiBetweenRun({ player: newPs, floor: battle.floor, gold: newPs.gold, pendingSkillChoices: choices, bossHealGained: bossHeal, pendingBuffs: {}, skills: myPs.skills || [] });
                    setMultiBetweenStatDraft({ hp:0,atk:0,def:0 });
                    setMultiBetweenScreen('stat');
                  }
                  setMultiNextClicked(true);
                  markNextReady(roomId, myUid).catch(console.error);
                }}>
                {myPs.hp <= 0 ? '사망 확인' : enemy.hp <= 0 ? `✨ ${battle.floor}층 클리어!` : '다음 턴 →'}
              </button>
        )}

        {/* 내 카드 선택 (pick phase) */}
        {phase === 'pick' && myPs.hp > 0 && (
          <div className="tw-cards-area">
            {multiPicked
              ? <div className="tw-lounge-idle" style={{ textAlign:'center', padding: '12px 0', color: '#86efac' }}>✓ 카드 제출 완료 — 다른 플레이어 대기 중...</div>
              : (
                <>
                  {myPs.pStunned
                    ? <div className="tw-stun-bar"><span>⚡ 기절 — 행동 불가</span><button className="tw-next-btn" style={{width:'auto',padding:'7px 16px'}} onClick={()=>{
                        setMultiPicked('pass');
                        submitPick(roomId, myUid, 'pass').catch(e => { showToast('카드 제출 실패: ' + e.message); setMultiPicked(null); });
                      }}>턴 넘기기</button></div>
                    : (
                      <>
                        <div className="tw-cards-label">기본 카드</div>
                        <div className="tw-hand tw-basic-hand">
                          {BASIC_CARDS.map(c => {
                            const used = !!(myPs.basicUsed?.[c.id]);
                            return (
                              <div key={c.id} className={`tw-hcard${used?' used':''}`}
                                style={used ? {} : { '--hcard-color': c.color, borderColor: c.color }}
                                onClick={() => { if (used) return; setPreviewCard({ id: c.id, source: 'basic', multi: true }); }}>
                                {used ? <div className="tw-hcard-back" /> : <img src={c.img} alt={c.name} className="tw-hcard-img-full" />}
                              </div>
                            );
                          })}
                        </div>
                        {(myPs.skills || []).length > 0 && (
                          <>
                            <div className="tw-cards-label">스킬 카드</div>
                            <div className="tw-hand tw-skill-hand">
                              {(myPs.skills || []).map(id => {
                                const c = getCard(id); const used = !!(myPs.skillsUsed?.[id]);
                                return (
                                  <div key={id} className={`tw-hcard${used?' used':''}${!used?' skill-card':''}`}
                                    style={used ? {} : { '--hcard-color': c.color, borderColor: c.color }}
                                    onClick={() => { if (used) return; setPreviewCard({ id, source: 'skill', multi: true }); }}>
                                    {used ? <div className="tw-hcard-back" /> : <img src={c.img} alt={c.name} className="tw-hcard-img-full" />}
                                  </div>
                                );
                              })}
                            </div>
                          </>
                        )}
                      </>
                    )
                  }
                </>
              )
            }
          </div>
        )}
        {phase === 'pick' && myPs.hp <= 0 && (
          <div style={{ textAlign: 'center', color: 'var(--muted)', padding: '16px 0', fontSize: '0.85rem' }}>💀 사망 — 관전 중</div>
        )}
        {phase === 'resolving' && (
          <div style={{ textAlign: 'center', padding: '12px 0', color: 'var(--muted)', fontSize: '0.85rem' }}>계산 중...</div>
        )}
      </div>
    );
  }

  // WARNING
  if (screen === 'warning') return (
    <div className="tower-warning-screen">
      <div className="tower-warning-text">⚠ WARNING ⚠</div>
      <div className="tower-warning-sub">미지의 존재가 나타났다...</div>
    </div>
  );

  // 게임 오버
  if (screen === 'game_over') {
    const cleared = run ? run.maxFloor : 0;
    return (
      <div className="tower-screen">
        <div className="tower-midscreen-wrap">
          <div className="tower-section-title" style={{ color: cleared > 0 ? '#fbbf24' : 'var(--muted)' }}>
            {cleared === 0 ? '도전 실패' : `${cleared}층 클리어`}
          </div>
          {run?.playerCardDef && (
            <div className="tower-gameover-img"><img src={`/${run.playerCardDef.img}`} alt="" /></div>
          )}
          <div className="tower-result-stats">
            <div className="tower-result-row"><span>이번 런</span><strong>{cleared}층</strong></div>
            <div className="tower-result-row"><span>이번 주 최고</span><strong>{Math.max(myBest, cleared)}층</strong></div>
          </div>
          <div className="tower-intro-btns">
            <button className="tower-primary-btn" onClick={() => setScreen('select')}>다시 도전</button>
            <button className="tower-secondary-btn" onClick={() => { setRun(null); setScreen('intro'); }}>처음으로</button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
