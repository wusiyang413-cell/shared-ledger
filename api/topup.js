const { Redis } = require('@upstash/redis');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    var body = req.body || {};
    if (typeof body === 'string') body = JSON.parse(body);
    var amount = Number(body.amount);
    if (!amount || amount <= 0 || !isFinite(amount)) {
      return res.status(400).json({ error: '金额必须为正数' });
    }
    // 限制单次充值不超过 100 万
    if (amount > 1000000) {
      return res.status(400).json({ error: '单次充值金额过大' });
    }

    const redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });

    const raw = await redis.get('ledger:state');
    var state = raw ? JSON.parse(raw) : {
      balance: 10000, used: 0, initial: 10000, entries: [], version: 0
    };

    state.balance += amount;
    state.initial += amount;
    state.version = (state.version || 0) + 1;

    state.entries.push({
      note: '充值',
      perPerson: amount,
      people: 1,
      person: '系统',
      amount: amount,
      time: new Date().toISOString(),
      balanceAfter: state.balance
    });

    await redis.set('ledger:state', JSON.stringify(state));

    res.json({ ok: true, newBalance: state.balance, initial: state.initial });
  } catch (e) {
    console.error('topup error:', e);
    res.status(500).json({ error: '充值失败: ' + (e.message || '未知错误') });
  }
};
