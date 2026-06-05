import { useState, useEffect, useCallback, useRef } from 'react';

export interface WebSocketMessage {
  type: string;
  payload: any;
}

export function useWebSockets(defaultUrl: string) {
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const urlRef = useRef<string>(defaultUrl);

  const connect = useCallback((customUrl?: string) => {
    const targetUrl = customUrl || urlRef.current;
    if (customUrl) {
      urlRef.current = customUrl;
    }

    if (wsRef.current) {
      wsRef.current.close();
    }

    console.log(`🔌 Conectando al WebSocket del backend Go en: ${targetUrl}`);
    try {
      const ws = new WebSocket(targetUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('✅ Conexión WebSocket establecida con Go API');
        setIsConnected(true);
      };

      ws.onmessage = (event) => {
        try {
          const data: WebSocketMessage = JSON.parse(event.data);
          console.log('📩 Mensaje recibido de Go API:', data);
          setLastMessage(data);
        } catch (err) {
          console.error('❌ Error parseando mensaje WebSocket:', err);
        }
      };

      ws.onclose = (event) => {
        console.log('🔌 Conexión WebSocket cerrada:', event.reason);
        setIsConnected(false);
      };

      ws.onerror = (error) => {
        console.error('🚨 Error en WebSocket:', error);
      };
    } catch (err) {
      console.error('🚨 Fallo al instanciar WebSocket:', err);
      setIsConnected(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setIsConnected(false);
  }, []);

  const sendMessage = useCallback((type: string, payload: any) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      const msg = JSON.stringify({ type, payload });
      wsRef.current.send(msg);
      console.log('📤 Mensaje enviado a Go API:', { type, payload });
      return true;
    } else {
      console.warn('⚠️ No se puede enviar el mensaje. WebSocket no está conectado.');
      return false;
    }
  }, []);

  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  return {
    isConnected,
    lastMessage,
    connect,
    disconnect,
    sendMessage,
  };
}

