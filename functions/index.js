/**
 * Cloud Functions for Creature World - Raid Auto-Damage & Weekly Reset
 *
 * raidAutoTick: 매 1분마다 active 보스에 참여자별 20틱 데미지 적용
 * weeklyBossReset: 매주 월요일 00:00 KST에 보스 초기화
 */

const { onSchedule } = require('firebase-functions/v2/scheduler');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue, Timestamp } = require('firebase-admin/firestore');

initializeApp();

const BOSS_IDS      = ['cursed_doll_king'];
const BOSS_HP       = 50_000_000;
const TICK_MS       = 3_000;
const RUN_MS        = 60_000;
const TICKS_PER_RUN = Math.floor(RUN_MS / TICK_MS); // 20틱

const GRADE_RANGE = {
  n:    [1,  10],
  r:    [11, 20],
  sr:   [21, 30],
  ur:   [31, 40],
  lg:   [51, 60],
  raid: [56, 65],
};

function avgDmg(grade, cond, enhanceLevel = 0) {
  const [min, max] = GRADE_RANGE[grade] || [1, 10];
  const base = Math.floor((min + max) / 2);
  return Math.floor((base + (cond || 1)) * (1 + (enhanceLevel || 0) * 0.1));
}

// ── 매 1분마다 자동 데미지 틱 ──
exports.raidAutoTick = onSchedule(
  {
    schedule:  'every 1 minutes',
    timeZone:  'Asia/Seoul',
    region:    'asia-northeast3',
  },
  async () => {
    const db = getFirestore();

    for (const bossId of BOSS_IDS) {
      const channelsSnap = await db
        .collection('raids').doc(bossId)
        .collection('channels')
        .where('status', '==', 'active')
        .get();

      for (const channelDoc of channelsSnap.docs) {
        const channelRef = channelDoc.ref;

        await db.runTransaction(async (tx) => {
          const snap = await tx.get(channelRef);
          if (!snap.exists) return;

          const channel = snap.data();
          if (channel.status !== 'active') return;

          const parts = channel.participants || {};
          if (Object.keys(parts).length === 0) return;

          const currentHp = Math.max(0, channel.hp || 0);
          if (currentHp <= 0) return;

          const updates = {};
          let totalBatchDmg = 0;

          for (const [uid, part] of Object.entries(parts)) {
            const dmgPerTick = avgDmg(part.cardGrade, part.cardCondition, part.cardEnhanceLevel || 0) + (part.cardBonus || 0);
            const batchDmg   = dmgPerTick * TICKS_PER_RUN;
            updates[`participants.${uid}.damage`] = FieldValue.increment(batchDmg);
            totalBatchDmg += batchDmg;
          }

          const newHp = Math.max(0, currentHp - totalBatchDmg);
          updates.hp  = newHp;
          if (newHp <= 0) updates.status = 'defeated';

          tx.update(channelRef, updates);
        });
      }
    }

    return null;
  },
);

// ── 매주 월요일 00:00 KST 보스 초기화 ──
exports.weeklyBossReset = onSchedule(
  {
    schedule: '0 0 * * 1',
    timeZone: 'Asia/Seoul',
    region:   'asia-northeast3',
  },
  async () => {
    const db  = getFirestore();
    const now = new Date();
    const end = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    for (const bossId of BOSS_IDS) {
      await db.collection('raids').doc(bossId).set({
        hp:            BOSS_HP,
        maxHp:         BOSS_HP,
        status:        'active',
        participants:  {},
        claimedRewards: [],
        startDate:     Timestamp.fromDate(now),
        endDate:       Timestamp.fromDate(end),
      });
    }

    return null;
  },
);
