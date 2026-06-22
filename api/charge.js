const { Redis } = require('@upstash/redis');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const perPerson = parseFloat(body.perPerson) || 0;
    const people = parseInt(body.people) || 0;
    const person = String(body.person || '').trim();
    const note = String(body.note || '').trim();

    if (!person || !perPerson || !people || perPerson <= 0 || people <= 0) {
      return res.status(400).json({ error: '\u53c2\u6570\u4e0d\u5b8c\u6574' });
    }

    const redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });

    let raw = await redis.get('ledger:state');
    let state = raw ? JSON.parse(raw) : {
      balance: 10000, used: 0, initial: 10000, entries: [], version: 0
    };

    const amount = Math.round(perPerson * people * 100) / 100;

    if (amount > state.balance) {
      return res.status(400).json({ error: '\u4f59\u989d\u4e0d\u8db3', balance: state.balance });
    }

    state.balance = Math.round((state.balance - amount) * 100) / 100;
    state.used = Math.round((state.initial - state.balance) * 100) / 100;
    state.version = (state.version || 0) + 1;

    const entry = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      time: new Date().toISOString(),
      person,
      perPerson,
      people,
      amount,
      note,
      balanceAfter: state.balance,
    };
    state.entries.push(entry);

    await redis.set('ledger:state', JSON.stringify(state), { ex: 86400 * 365 });

    return res.json({ ok: true, entry, state });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
