import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'crypto';
import { supabaseAdmin } from './_lib/supabaseAdmin';
import { sendToPlayer } from './_lib/broadcast';

async function createRoom(p1: { playerId: string; username: string }, p2: { playerId: string; username: string }) {
  const roomId = `room_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  await supabaseAdmin.from('rooms').insert({
    id: roomId,
    player1_id: p1.playerId,
    player2_id: p2.playerId,
    player1_username: p1.username,
    player2_username: p2.username,
    turn_p1: true,
    started: false,
    over: false
  });

  await supabaseAdmin.from('room_by_player').insert([
    { player_id: p1.playerId, room_id: roomId },
    { player_id: p2.playerId, room_id: roomId }
  ]);

  await Promise.all([
    sendToPlayer(p1.playerId, 'match_found', {
      roomId, role: 'player_1', opponentId: p2.playerId, opponentUsername: p2.username, playerTurn: true
    }),
    sendToPlayer(p2.playerId, 'match_found', {
      roomId, role: 'player_2', opponentId: p1.playerId, opponentUsername: p1.username, playerTurn: false
    })
  ]);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { playerId, username, inviteHash, invitePreimage } = req.body || {};
  if (!playerId) return res.status(400).json({ error: 'playerId requerido' });

  // 1. Reconexión: si el jugador ya tiene una sala activa, reintegrarlo sin recrearla.
  const { data: existingLink } = await supabaseAdmin
    .from('room_by_player')
    .select('room_id')
    .eq('player_id', playerId)
    .maybeSingle();

  if (existingLink) {
    const { data: room } = await supabaseAdmin.from('rooms').select('*').eq('id', existingLink.room_id).maybeSingle();
    if (room && !room.over) {
      const isP1 = room.player1_id === playerId;
      const opponentId = isP1 ? room.player2_id : room.player1_id;
      const opponentUsername = isP1 ? room.player2_username : room.player1_username;
      const playerTurn = isP1 ? room.turn_p1 : !room.turn_p1;

      await sendToPlayer(playerId, 'match_found', {
        roomId: room.id, role: isP1 ? 'player_1' : 'player_2', opponentId, opponentUsername, playerTurn
      });
      await sendToPlayer(opponentId, 'opponent_reconnected', { message: `El oponente ${username} ha regresado a la arena.` });
      return res.status(200).json({ ok: true, reconnected: true });
    }
  }

  // 2. Sala privada: unirse con preimagen ZK.
  if (invitePreimage) {
    const hash = crypto.createHash('sha256').update(invitePreimage).digest('hex');
    const { data: lobby } = await supabaseAdmin.from('invite_lobbies').select('*').eq('invite_hash', hash).maybeSingle();
    if (!lobby) {
      await sendToPlayer(playerId, 'lobby_error', { message: 'Código de invitación inválido o sala no encontrada' });
      return res.status(200).json({ ok: true });
    }
    await supabaseAdmin.from('invite_lobbies').delete().eq('invite_hash', hash);
    await createRoom({ playerId: lobby.host_player_id, username: lobby.host_username }, { playerId, username });
    return res.status(200).json({ ok: true });
  }

  // 3. Sala privada: hospedar (esperar invitado).
  if (inviteHash) {
    await supabaseAdmin.from('invite_lobbies').upsert({ invite_hash: inviteHash, host_player_id: playerId, host_username: username });
    return res.status(200).json({ ok: true });
  }

  // 4. Matchmaker público.
  await supabaseAdmin.from('matchmaking_queue').upsert({ player_id: playerId, username });

  const { data: waiting } = await supabaseAdmin
    .from('matchmaking_queue')
    .select('*')
    .order('created_at', { ascending: true })
    .limit(2);

  if (waiting && waiting.length >= 2) {
    const [p1, p2] = waiting;
    await supabaseAdmin.from('matchmaking_queue').delete().in('player_id', [p1.player_id, p2.player_id]);
    await createRoom(
      { playerId: p1.player_id, username: p1.username },
      { playerId: p2.player_id, username: p2.username }
    );
  }

  return res.status(200).json({ ok: true });
}
