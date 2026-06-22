import { saveState, snapshot } from '../../lib/state.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const fresh = { nextId: 1, entries: [] };
  await saveState(fresh);
  res.status(200).json({ ok: true, state: snapshot(fresh) });
}
