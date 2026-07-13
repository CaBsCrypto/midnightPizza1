import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseAdmin } from './_lib/supabaseAdmin';
import { sendToPlayer } from './_lib/broadcast';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { playerId, roomId } = req.body || {};
  if (!playerId || !roomId) return res.status(400).json({ error: 'playerId y roomId son requeridos' });

  const { data: room } = await supabaseAdmin.from('rooms').select('*').eq('id', roomId).maybeSingle();
  if (!room || room.over) return res.status(200).json({ ok: true });

  const { data: updatedRows } = await supabaseAdmin
    .from('rooms')
    .update({ over: true, updated_at: new Date().toISOString() })
    .eq('id', roomId)
    .eq('over', false)
    .select('id');

  if (!updatedRows || updatedRows.length === 0) return res.status(200).json({ ok: true });

  const opponentId = room.player1_id === playerId ? room.player2_id : room.player1_id;

  await Promise.all([
    sendToPlayer(playerId, 'game_over', { winner: 'rival' }),
    sendToPlayer(opponentId, 'game_over', { winner: 'player' })
  ]);

  return res.status(200).json({ ok: true });
}
