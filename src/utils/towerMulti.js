import { rtdb } from '../firebase/config.js';
import { ref, set, update, push, get, onValue, off, remove } from 'firebase/database';

export const ROOMS_PATH = 'towerRooms';
const rRef = (...parts) => ref(rtdb, [ROOMS_PATH, ...parts].join('/'));

export async function createRoom(title, user, nickname) {
  const name = nickname || user.displayName || '플레이어';
  const newRef = push(ref(rtdb, ROOMS_PATH));
  await set(newRef, {
    title: title || `${name}의 방`,
    hostUid: user.uid,
    status: 'waiting',
    createdAt: Date.now(),
    players: {
      [user.uid]: { name, cardId: null, cardImg: null, job: null, ready: false, alive: true, slot: 0 },
    },
  });
  return newRef.key;
}

export async function joinRoom(roomId, user, nickname) {
  const name = nickname || user.displayName || '플레이어';
  const snap = await get(rRef(roomId, 'players'));
  const players = snap.val() || {};
  if (Object.keys(players).length >= 4) throw new Error('방이 꽉 찼습니다');
  if (players[user.uid]) return;
  const taken = Object.values(players).map(p => p.slot);
  let slot = 0; while (taken.includes(slot)) slot++;
  await set(rRef(roomId, 'players', user.uid), {
    name, cardId: null, cardImg: null, job: null, ready: false, alive: true, slot,
  });
}

export async function leaveRoom(roomId, uid, roomData) {
  const players = roomData?.players || {};
  const remaining = Object.keys(players).filter(k => k !== uid);
  if (remaining.length === 0) return remove(rRef(roomId));
  const updates = { [`players/${uid}`]: null };
  if (roomData?.hostUid === uid) updates.hostUid = remaining[0];
  return update(rRef(roomId), updates);
}

export const setPlayerCard = (roomId, uid, cardId, cardImg) =>
  update(rRef(roomId, 'players', uid), { cardId, cardImg, ready: false });

export const setPlayerJob = (roomId, uid, job) =>
  update(rRef(roomId, 'players', uid), { job, ready: false });

export const setPlayerReady = (roomId, uid, ready) =>
  update(rRef(roomId, 'players', uid), { ready });

export const submitPick = (roomId, uid, cardId) =>
  set(rRef(roomId, 'battle', 'picks', uid), cardId);

export const writeBattle = (roomId, data) =>
  update(rRef(roomId, 'battle'), data);

export const setRoomStatus = (roomId, status) =>
  update(rRef(roomId), { status });

export const markJobReady = (roomId, uid, job) =>
  update(rRef(roomId), {
    [`players/${uid}/job`]: job,
    [`jobReady/${uid}`]: true,
  });

export const markNextReady = (roomId, uid) =>
  update(rRef(roomId, 'battle'), { [`nextReady/${uid}`]: true });

export const sendChat = (roomId, uid, msg) =>
  update(rRef(roomId, 'players', uid), { chat: { msg: msg.trim().slice(0, 30), ts: Date.now() } });

export const markBetweenReady = (roomId, uid, playerState) =>
  update(rRef(roomId), {
    [`battle/playerStates/${uid}`]: playerState,
    [`battle/betweenReady/${uid}`]: true,
  });

export function subscribeRoom(roomId, cb, onError) {
  const r = rRef(roomId);
  onValue(r, snap => cb(snap.val()), err => { if (onError) onError(err); else console.error('subscribeRoom error:', err); });
  return () => off(r);
}

export function subscribeRooms(cb, onError) {
  const r = ref(rtdb, ROOMS_PATH);
  onValue(r, snap => cb(snap.val()), err => { if (onError) onError(err); else console.error('subscribeRooms error:', err); });
  return () => off(r);
}
