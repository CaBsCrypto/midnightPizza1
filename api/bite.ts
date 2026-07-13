import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseAdmin } from './_lib/supabaseAdmin';
import { sendToPlayer } from './_lib/broadcast';
import { applyBite, PlayerState } from './_lib/gameLogic';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { playerId, roomId, r, c } = req.body || {};
  if (!playerId || !roomId || typeof r !== 'number' || typeof c !== 'number') {
    return res.status(400).json({ error: 'playerId, roomId, r y c son requeridos' });
  }
  if (r < 0 || r > 5 || c < 0 || c > 5) {
    await sendToPlayer(playerId, 'error', { message: 'Celda fuera de rango.' });
    return res.status(200).json({ ok: true });
  }

  const { data: room } = await supabaseAdmin.from('rooms').select('*').eq('id', roomId).maybeSingle();
  if (!room || !room.started || room.over) {
    await sendToPlayer(playerId, 'error', { message: 'La partida no está activa.' });
    return res.status(200).json({ ok: true });
  }

  const isP1 = room.player1_id === playerId;
  if (!isP1 && room.player2_id !== playerId) {
    return res.status(403).json({ error: 'El jugador no pertenece a esta sala' });
  }

  const myTurn = isP1 ? room.turn_p1 : !room.turn_p1;
  if (!myTurn) {
    await sendToPlayer(playerId, 'error', { message: 'No es tu turno.' });
    return res.status(200).json({ ok: true });
  }

  const attackerBitten: boolean[][] = isP1 ? room.p1_bitten : room.p2_bitten;
  if (attackerBitten?.[r]?.[c]) {
    await sendToPlayer(playerId, 'error', { message: 'Ya mordiste esa casilla.' });
    return res.status(200).json({ ok: true });
  }

  const attacker: PlayerState = {
    hp: isP1 ? room.p1_hp : room.p2_hp,
    score: isP1 ? room.p1_score : room.p2_score,
    immunity: isP1 ? room.p1_immunity : room.p2_immunity
  };
  const defender: PlayerState = {
    hp: isP1 ? room.p2_hp : room.p1_hp,
    score: isP1 ? room.p2_score : room.p1_score,
    immunity: isP1 ? room.p2_immunity : room.p1_immunity
  };
  const defenderBoard: number[][] = isP1 ? room.p2_board : room.p1_board;
  const val = defenderBoard[r][c];

  applyBite(attacker, defender, val);

  const newBitten = attackerBitten.map(row => [...row]);
  newBitten[r][c] = true;

  const newTurnP1 = !room.turn_p1;
  const over = attacker.hp <= 0 || defender.hp <= 0;
  const attackerWon = over && defender.hp <= 0;

  // Update condicionado al turno que leímos, para evitar procesar el mismo mordisco dos veces
  // si llegaran dos solicitudes en carrera (no hay transacción multi-fila real vía REST).
  const updatePayload: Record<string, unknown> = {
    turn_p1: newTurnP1,
    over,
    updated_at: new Date().toISOString(),
    [isP1 ? 'p1_hp' : 'p2_hp']: attacker.hp,
    [isP1 ? 'p1_score' : 'p2_score']: attacker.score,
    [isP1 ? 'p1_immunity' : 'p2_immunity']: attacker.immunity,
    [isP1 ? 'p1_bitten' : 'p2_bitten']: newBitten,
    [isP1 ? 'p2_hp' : 'p1_hp']: defender.hp
  };

  const { data: updatedRows } = await supabaseAdmin
    .from('rooms')
    .update(updatePayload)
    .eq('id', roomId)
    .eq('turn_p1', room.turn_p1)
    .eq('over', false)
    .select('id');

  if (!updatedRows || updatedRows.length === 0) {
    await sendToPlayer(playerId, 'error', { message: 'No es tu turno.' });
    return res.status(200).json({ ok: true });
  }

  const attackerId = playerId;
  const defenderId = isP1 ? room.player2_id : room.player1_id;
  const attackerTurnAfter = isP1 ? newTurnP1 : !newTurnP1;

  await Promise.all([
    sendToPlayer(attackerId, 'bite_result', {
      r, c, val,
      playerHP: attacker.hp, playerScore: attacker.score,
      rivalHP: defender.hp, rivalScore: defender.score,
      playerTurn: attackerTurnAfter
    }),
    sendToPlayer(defenderId, 'rival_bite', {
      r, c, val,
      playerHP: defender.hp, playerScore: defender.score,
      rivalHP: attacker.hp, rivalScore: attacker.score,
      playerTurn: !attackerTurnAfter
    })
  ]);

  if (over) {
    await Promise.all([
      sendToPlayer(attackerId, 'game_over', { winner: attackerWon ? 'player' : 'rival' }),
      sendToPlayer(defenderId, 'game_over', { winner: attackerWon ? 'rival' : 'player' })
    ]);
  }

  return res.status(200).json({ ok: true });
}
