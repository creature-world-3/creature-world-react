/**
 * Cloud Functions for Creature World - Raid Auto-Damage
 *
 * 주의: Cloud Scheduler 최소 주기는 1분입니다.
 * 3초 단위 틱을 시뮬레이션하기 위해 1분당 20틱(3초×20=60초)을 일괄 처리합니다.
 *
 * 동작:
 *   - 매 1분마다 raids/ 컬렉션의 active 보스를 조회
 *   - 참여자별 카드 등급+컨디션으로 20틱 데미지 계산 (평균값 사용)
 *   - 보스 HP 차감 및 participants.{uid}.damage 누적
 *   - HP <= 0 이면 status = 'defeated' 처리
 */

const { onSchedule } = require('firebase-functions/v2/scheduler');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

initializeApp();

// ── 상수 ──
const BOSS_IDS     = ['current_boss'];
const TICK_MS      = 3_000;
const RUN_MS       = 60_000;
const TICKS_PER_RUN = Math.floor(RUN_MS / TICK_MS); // 20틱

const GRADE_RANGE = {
  n:    [1,  10 ],
  r:    [21, 30 ],
  sr:   [31, 40 ],
  ur:   [41, 50 ],
  lg:   [91, 100],
  raid: [91, 100],
};

function avgDmg(grade, cond) {
  const [min, max] = GRADE_RANGE[grade] || [1, 10];
  return Math.floor((min + max) / 2) + (cond || 1);
}

exports.raidAutoTick = onSchedule(
  {
    schedule:  'every 1 minutes',
    timeZone:  'Asia/Seoul',
    region:    'asia-northeast3',
  },
  async () => {
    const db = getFirestore();

    for (const bossId of BOSS_IDS) {
      const raidRef = db.collection('raids').doc(bossId);

      await db.runTransaction(async (tx) => {
        const snap = await tx.get(raidRef);
        if (!snap.exists) return;

        const raid = snap.data();
        if (raid.status !== 'active') return;

        const parts = raid.participants || {};
        if (Object.keys(parts).length === 0) return;

        const maxHp    = raid.maxHp || 3_000_000;
        const currentHp = Math.max(0, raid.hp || 0);
        if (currentHp <= 0) return;

        // 참여자별 20틱 데미지 계산
        const updates = {};
        let totalBatchDmg = 0;

        for (const [uid, part] of Object.entries(parts)) {
          const dmgPerTick = avgDmg(part.cardGrade, part.cardCondition);
          const batchDmg   = dmgPerTick * TICKS_PER_RUN;
          updates[`participants.${uid}.damage`] = FieldValue.increment(batchDmg);
          totalBatchDmg += batchDmg;
        }

        const newHp = Math.max(0, currentHp - totalBatchDmg);
        updates.hp  = newHp;

        if (newHp <= 0) {
          updates.status = 'defeated';
        }

        tx.update(raidRef, updates);
      });
    }

    return null;
  },
);
