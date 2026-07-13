import { supabaseAdmin } from './supabaseAdmin';

// Envía un evento `{type, payload}` (mismo formato que emitía el servidor Go por WebSocket)
// al canal de Realtime Broadcast privado de un jugador. Cada invocación abre el canal,
// espera a que quede suscrito, envía el mensaje y lo cierra — no hay conexión persistente
// que mantener entre funciones serverless.
export async function sendToPlayer(playerId: string, type: string, payload: unknown): Promise<void> {
  const channel = supabaseAdmin.channel(`player:${playerId}`);

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Timeout suscribiendo canal player:${playerId}`)), 5000);
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        clearTimeout(timeout);
        resolve();
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        clearTimeout(timeout);
        reject(new Error(`No se pudo suscribir al canal player:${playerId} (${status})`));
      }
    });
  });

  await channel.send({ type: 'broadcast', event: 'game', payload: { type, payload } });
  await supabaseAdmin.removeChannel(channel);
}
