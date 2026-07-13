import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseAdmin } from './_lib/supabaseAdmin';
import { sendToPlayer } from './_lib/broadcast';
import { defaultRival, isValidBoard } from './_lib/gameLogic';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { playerId, roomId, board } = req.body || {};
  if (!playerId || !roomId || !isValidBoard(board)) {
    return res.status(400).json({ error: 'playerId, roomId y board (6x6) son requeridos' });
  }

  const { data: room } = await supabaseAdmin.from('rooms').select('*').eq('id', roomId).maybeSingle();
  if (!room || room.started) {
    // Partida ya iniciada o sala inexistente: no se permite cambiar el tablero.
    return res.status(200).json({ ok: true });
  }

  const isP1 = room.player1_id === playerId;
  if (!isP1 && room.player2_id !== playerId) {
    return res.status(403).json({ error: 'El jugador no pertenece a esta sala' });
  }

  const column = isP1 ? 'p1_board' : 'p2_board';
  await supabaseAdmin.from('rooms').update({ [column]: board, updated_at: new Date().toISOString() }).eq('id', roomId);

  const { data: updated } = await supabaseAdmin.from('rooms').select('*').eq('id', roomId).maybeSingle();
  if (updated && updated.p1_board && updated.p2_board && !updated.started) {
    await supabaseAdmin.from('rooms').update({ started: true, turn_p1: true }).eq('id', roomId);

    await Promise.all([
      sendToPlayer(updated.player1_id, 'match_start', { playerTurn: true, rivalChef: defaultRival(updated.player2_username) }),
      sendToPlayer(updated.player2_id, 'match_start', { playerTurn: false, rivalChef: defaultRival(updated.player1_username) })
    ]);
  }

  return res.status(200).json({ ok: true });
}
