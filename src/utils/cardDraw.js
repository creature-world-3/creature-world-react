let _uid = 0;
export function genDrawUid() {
  return `d${++_uid}_${Date.now()}`;
}

// Returns { newOwned, isNew, isDupe, leveledUp, progress, level }
// Awakened and raid cards skip the levelUp system — just add once.
export function addCardOrLevelUp(ownedCards, card, condition) {
  if (card.awakened || card.grade === 'raid') {
    const alreadyOwns = ownedCards.some(c => c.id === card.id);
    if (alreadyOwns) {
      return { newOwned: ownedCards, isNew: false, isDupe: true, leveledUp: false, progress: 0, level: 0 };
    }
    return {
      newOwned: [...ownedCards, { uid: genDrawUid(), id: card.id, condition, enhanceLevel: 0, levelCount: 0, levelProgress: 0 }],
      isNew: true, isDupe: false, leveledUp: false, progress: 0, level: 0,
    };
  }

  const existingIdx = ownedCards.findIndex(c => c.id === card.id);
  if (existingIdx >= 0) {
    const existing = ownedCards[existingIdx];
    const prevProgress = existing.levelProgress || 0;
    const newProgress  = prevProgress + 1;
    const prevLevel    = existing.levelCount || 0;
    const newLevel     = Math.floor(newProgress / 100);
    const leveledUp    = newLevel > prevLevel;
    const newOwned     = [...ownedCards];
    newOwned[existingIdx] = { ...existing, levelProgress: newProgress, levelCount: newLevel };
    return { newOwned, isNew: false, isDupe: true, leveledUp, progress: newProgress, level: newLevel };
  }

  return {
    newOwned: [...ownedCards, { uid: genDrawUid(), id: card.id, condition, enhanceLevel: 0, levelCount: 0, levelProgress: 0 }],
    isNew: true, isDupe: false, leveledUp: false, progress: 0, level: 0,
  };
}

export function calcDmgRange(grade, cond, enhanceLevel = 0, levelCount = 0, growthBonus = 0) {
  const GRADE_RANGE = { n:[1,10], r:[11,20], sr:[21,30], ur:[31,40], lg:[51,60], raid:[56,65], awakened:[80,100] };
  const [mn, mx] = GRADE_RANGE[grade] || [1, 10];
  const mult = 1 + enhanceLevel * 0.1 + levelCount * 0.02;
  return [
    Math.floor((mn + (cond || 1)) * mult) + growthBonus,
    Math.floor((mx + (cond || 1)) * mult) + growthBonus,
  ];
}
