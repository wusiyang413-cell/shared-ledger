import { Redis } from '@upstash/redis';

const INITIAL_BALANCE = 10000;
const KEY = 'ledger:state';

let redis;
function getRedis() {
  if (!redis) redis = Redis.fromEnv();
  return redis;
}

export async function loadState() {
  try {
    const obj = await getRedis().get(KEY);
    if (obj && Array.isArray(obj.entries)) return obj;
  } catch (e) { console.error('KV read fail:', e.message); }
  return { nextId: 1, entries: [] };
}

export async function saveState(state) {
  await getRedis().set(KEY, state);
}

export function getBalance(state) {
  const used = state.entries.reduce((s, e) => s + e.total, 0);
  return {
    balance: Math.round((INITIAL_BALANCE - used) * 100) / 100,
    used:    Math.round(used * 100) / 100
  };
}

export function snapshot(state) {
  return { ...getBalance(state), initial: INITIAL_BALANCE, entries: state.entries.slice().reverse() };
}

export { INITIAL_BALANCE };
