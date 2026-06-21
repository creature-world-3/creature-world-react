import { CARDS } from '../data/cards.js';

/**
 * cardBonusDmg 읽기/쓰기 유틸
 * 저장 키: inst.uid (인스턴스 고유값)
 * 구버전 card.id 키 데이터는 App.jsx migrateUserData()가 로드 시 1회 자동 정리
 */

/** 인스턴스의 성장값 읽기 */
export function getGrowth(cardBonusDmg, inst) {
  if (!inst || !cardBonusDmg) return 0;
  return cardBonusDmg[inst.uid] ?? 0;
}

/** 성장석 1개 적용 후 새 cardBonusDmg 맵 반환 */
export function applyGrowthStone(cardBonusDmg, inst) {
  const cur    = getGrowth(cardBonusDmg, inst);
  const newMap = { ...(cardBonusDmg || {}), [inst.uid]: cur + 1 };
  return { newMap, newGrowth: cur + 1 };
}

/**
 * 도감 보너스 계산 — 보유 카드 종류별 등급 보너스 합산
 * (GachaTab, SynthTab, DexTab, RaidTab에서 동일 로직 사용)
 */
const BONUS_MULT = { n:0.5, r:1, sr:2, ur:3, lg:5, raid:10, awakened:15 };
export function calcBonus(ownedCards) {
  let b = 0;
  const seen = new Set();
  for (const o of (ownedCards || [])) {
    if (seen.has(o.id)) continue;
    seen.add(o.id);
    const c = CARDS.find(x => x.id === o.id);
    if (c) b += BONUS_MULT[c.grade] || 0;
  }
  return Math.floor(b);
}
