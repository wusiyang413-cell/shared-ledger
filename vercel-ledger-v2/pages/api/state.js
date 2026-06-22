import { loadState, snapshot } from '../../lib/state.js';

export default async function handler(req, res) {
  const state = await loadState();
  res.status(200).json(snapshot(state));
}
