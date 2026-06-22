const { Redis } = require('@upstash/redis');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    const redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });

    await redis.del('ledger:state');

    const fresh = {
      balance: 10000, used: 0, initial: 10000, entries: [], version: 0
    };
    await redis.set('ledger:state', JSON.stringify(fresh), { ex: 86400 * 365 });

    return res.json({ ok: true, state: fresh });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
