import { loadState, saveState, snapshot, getBalance } from '../../lib/state.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { operator, note, breakdown } = req.body || {};
  if (!operator || typeof operator !== 'string' || !operator.trim()) {
    return res.status(400).json({ error: '请填写操作人姓名' });
  }
  if (!Array.isArray(breakdown) || breakdown.length === 0) {
    return res.status(400).json({ error: '请至少添加一组人数配置' });
  }

  const normalized = [];
  let total = 0;
  for (const it of breakdown) {
    const count = Number(it.count);
    const price = Number(it.price);
    if (!Number.isInteger(count) || count <= 0)
      return res.status(400).json({ error: '人数必须是正整数' });
    if (!Number.isFinite(price) || price <= 0)
      return res.status(400).json({ error: '人均金额必须大于 0' });
    const sub = Math.round(count * price * 100) / 100;
    normalized.push({ price: Math.round(price * 100) / 100, count, subtotal: sub });
    total += sub;
  }
  total = Math.round(total * 100) / 100;

  const state = await loadState();
  if (total > getBalance(state).balance) {
    return res.status(400).json({ error: `余额不足,本次需要 ${total} 元,剩余 ${getBalance(state).balance} 元` });
  }

  const entry = {
    id: state.nextId++,
    createdAt: new Date().toISOString(),
    operator: operator.trim(),
    note: (note || '').trim(),
    breakdown: normalized,
    total
  };
  state.entries.push(entry);
  await saveState(state);

  res.status(200).json({ ok: true, entry, state: snapshot(state) });
}
