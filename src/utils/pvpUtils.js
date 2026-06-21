import { rtdb } from '../firebase/config.js';
import { ref, set, remove, update, push, onValue, off } from 'firebase/database';

export const PVP_QUEUE_PATH      = 'pvpQueue';
export const PVP_MATCH_PATH      = 'pvpMatches';
export const PVP_USER_MATCH_PATH = 'pvpUserMatch';

export const enterQueue      = (uid, data)    => set(ref(rtdb, `${PVP_QUEUE_PATH}/${uid}`), data);
export const leaveQueue      = (uid)          => remove(ref(rtdb, `${PVP_QUEUE_PATH}/${uid}`));
export const clearUMatch     = (uid)          => remove(ref(rtdb, `${PVP_USER_MATCH_PATH}/${uid}`));
export const submitPvpPick   = (mid, uid, v)  => set(ref(rtdb, `${PVP_MATCH_PATH}/${mid}/picks/${uid}`), v);
export const submitPvpSwitch = (mid, uid, i)  => set(ref(rtdb, `${PVP_MATCH_PATH}/${mid}/switchChoice/${uid}`), i);
export const createPvpMatch  = (data)         => push(ref(rtdb, PVP_MATCH_PATH), data);
export const batchPvpUpdate  = (updates)      => update(ref(rtdb), updates);

export function subscribeQueue(cb) {
  const r = ref(rtdb, PVP_QUEUE_PATH);
  onValue(r, snap => cb(snap.val() || {}));
  return () => off(r);
}
export function subscribeMatch(matchId, cb) {
  const r = ref(rtdb, `${PVP_MATCH_PATH}/${matchId}`);
  onValue(r, snap => cb(snap.val()));
  return () => off(r);
}
export function subscribeUMatch(uid, cb) {
  const r = ref(rtdb, `${PVP_USER_MATCH_PATH}/${uid}`);
  onValue(r, snap => cb(snap.val()));
  return () => off(r);
}
