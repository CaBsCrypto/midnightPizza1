import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseAdmin } from './_lib/supabaseAdmin';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { playerId } = req.body || {};
  if (!playerId) return res.status(400).json({ error: 'playerId requerido' });

  await supabaseAdmin.from('matchmaking_queue').delete().eq('player_id', playerId);
  await supabaseAdmin.from('invite_lobbies').delete().eq('host_player_id', playerId);

  return res.status(200).json({ ok: true });
}
