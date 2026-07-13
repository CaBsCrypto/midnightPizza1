import { useState, useCallback, useRef } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../lib/supabaseClient';

export interface WebSocketMessage {
  type: string;
  payload: any;
}

// Mapea cada tipo de evento del "protocolo" heredado del servidor Go a su función
// serverless equivalente en Vercel. El estado autoritativo vive en Supabase (Postgres);
// las notificaciones a los clientes viajan por Supabase Realtime Broadcast.
const ENDPOINTS: Record<string, string> = {
  join_lobby: '/api/join-lobby',
  submit_board: '/api/submit-board',
  bite: '/api/bite',
  cancel_matchmaking: '/api/cancel-matchmaking',
  forfeit: '/api/forfeit'
};

// Interfaz idéntica a la de useWebSockets (isConnected, lastMessage, connect, disconnect,
// sendMessage) para poder reemplazar un hook por el otro sin tocar el resto de App.tsx.
export function useRealtimeMatch(_defaultUrl?: string) {
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null);
  const playerIdRef = useRef<string | null>(null);
  const roomIdRef = useRef<string | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);

  // Se suscribe al canal privado de broadcast del jugador (player:{playerId}).
  // Recuerda el roomId en cuanto llega un match_found, para inyectarlo automáticamente
  // en las siguientes llamadas (submit_board, bite, forfeit) sin cambiar la firma de sendMessage.
  const subscribeToPlayer = useCallback((playerId: string) => {
    if (channelRef.current && playerIdRef.current === playerId) return;
    if (channelRef.current && supabase) {
      supabase.removeChannel(channelRef.current);
    }
    playerIdRef.current = playerId;
    roomIdRef.current = null;

    if (!supabase) {
      console.warn('Supabase no configurado: matchmaking en tiempo real no disponible.');
      return;
    }
    const channel = supabase.channel(`player:${playerId}`);
    channel.on('broadcast', { event: 'game' }, (msg: any) => {
      const data = msg.payload as WebSocketMessage;
      if (data?.type === 'match_found' && data.payload?.roomId) {
        roomIdRef.current = data.payload.roomId;
      }
      console.log('📩 Mensaje recibido de Supabase Realtime:', data);
      setLastMessage(data);
    });
    channel.subscribe();
    channelRef.current = channel;
  }, []);

  const connect = useCallback((_customUrl?: string) => {
    console.log('🔌 Sesión de matchmaking lista (Supabase Realtime).');
    setIsConnected(true);
  }, []);

  const disconnect = useCallback(() => {
    if (channelRef.current && supabase) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    playerIdRef.current = null;
    roomIdRef.current = null;
    setIsConnected(false);
  }, []);

  const sendMessage = useCallback((type: string, payload: any) => {
    const endpoint = ENDPOINTS[type];
    if (!endpoint) {
      console.warn(`⚠️ Tipo de mensaje desconocido para Supabase/Vercel: ${type}`);
      return false;
    }

    if (type === 'join_lobby' && payload?.playerId) {
      subscribeToPlayer(payload.playerId);
    }

    const body = { ...payload, playerId: playerIdRef.current, roomId: roomIdRef.current };
    console.log(`📤 Enviando ${type} a ${endpoint}:`, body);
    fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).catch(err => console.error(`❌ Error enviando ${type}:`, err));

    return true;
  }, [subscribeToPlayer]);

  return {
    isConnected,
    lastMessage,
    connect,
    disconnect,
    sendMessage
  };
}
