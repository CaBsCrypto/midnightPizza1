import React from 'react';

export interface RivalChef {
  name: string;
  emoji: string;
  title: string;
  aggression: number;
}

interface CombatConsoleProps {
  gameState: 'lobby' | 'playing' | 'ended';
  lobbyStatus: 'idle' | 'searching' | 'ready';
  rivalChef: RivalChef | null;
  playerTurn: boolean;
  isMultiplayerActive: boolean;
  matchmakingTime: number;
  turnTimer: number;
  onStartMatchmaking: () => void;
  onCancelMatchmaking: () => void;
  onForfeit: () => void;
  onBackToLobby: () => void;
  onOpenClaim: () => void;
  winner: 'player' | 'rival' | null;
  wsUrl: string;
  onWsUrlChange: (url: string) => void;
  isWSConnected: boolean;
  onConnectWS: () => void;
  onDisconnectWS: () => void;
}

export const CombatConsole: React.FC<CombatConsoleProps> = ({
  gameState,
  lobbyStatus,
  rivalChef,
  playerTurn,
  isMultiplayerActive,
  matchmakingTime,
  turnTimer,
  onStartMatchmaking,
  onCancelMatchmaking,
  onForfeit,
  onBackToLobby,
  onOpenClaim,
  winner,
  wsUrl,
  onWsUrlChange,
  isWSConnected,
  onConnectWS,
  onDisconnectWS
}) => {
  if (gameState === 'playing' && rivalChef) {
    const turnColor = playerTurn ? '#10b981' : '#ea580c';
    let turnText = playerTurn ? `👉 ¡TU TURNO DE MORDER!` : `⏳ TURNO RIVAL PENSANDO...`;
    if (isMultiplayerActive) {
      turnText = playerTurn ? `👉 ¡TU TURNO MULTIJUGADOR!` : `⏳ ESPERANDO MOVIMIENTO OPONENTE...`;
    }

    const isCritical = turnTimer <= 5;

    return (
      <div className="combat-control-center">
        <div className="horizontal-console-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
          {/* Rival Card info */}
          <div className="rival-horizontal-card" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span className="rival-emoji" style={{ fontSize: '24px' }}>{rivalChef.emoji}</span>
            <div className="rival-details" style={{ display: 'flex', flexDirection: 'column', textAlign: 'left' }}>
              <span className="rival-name" style={{ fontWeight: 'bold', fontFamily: 'Orbitron' }}>{rivalChef.name}</span>
              <span className="rival-title" style={{ fontSize: '10px', color: '#94a3b8' }}>{rivalChef.title}</span>
            </div>
            <div className="rival-aggression" style={{ color: 'var(--neon-red)' }}>
              {'🌶️'.repeat(rivalChef.aggression)}
            </div>
          </div>

          {/* Turn box badge */}
          <div 
            className="turn-status-badge" 
            style={{ 
              background: turnColor, 
              textShadow: '0 0 8px rgba(255,255,255,0.4)',
              padding: '6px 12px',
              borderRadius: '6px',
              fontFamily: 'Orbitron',
              fontSize: '11px',
              fontWeight: 'bold'
            }}
          >
            {turnText}
          </div>

          {/* HUD Stopwatch Chronometer */}
          <div 
            className={`hud-stopwatch-circle ${isCritical ? 'critical' : ''}`} 
            style={{ 
              borderColor: turnColor, 
              color: turnColor, 
              boxShadow: `0 0 15px ${turnColor}40`,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'center',
              width: '50px',
              height: '50px',
              borderRadius: '50%',
              border: '2px solid',
              fontFamily: 'Orbitron'
            }}
          >
            <span className="stopwatch-seconds" style={{ fontSize: '18px', fontWeight: 'bold' }}>{turnTimer}</span>
            <span className="stopwatch-unit" style={{ fontSize: '7px' }}>SEC</span>
          </div>

          <div className="console-actions">
            <button 
              className="console-btn btn-secondary" 
              onClick={onForfeit} 
              style={{ margin: 0, padding: '8px 16px', fontSize: '11px' }}
            >
              RENDIRSE 🏳️
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (gameState === 'ended') {
    const isWinner = winner === 'player';
    const color = isWinner ? '#10b981' : '#ef4444';
    const banner = isWinner ? '🏆 ¡VICTORIA CULINARIA!' : '💀 ¡DERROTA ROTUNDA!';
    const msg = isWinner 
      ? `Has devorado exitosamente todas las pizzas de tu oponente.` 
      : `Tu oponente ha arrasado tus defensas culinarias primero.`;

    return (
      <div className="combat-control-center">
        <div className="horizontal-console-row" style={{ justifyContent: 'center', width: '100%' }}>
          <div className="ended-status-block" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '24px' }}>{isWinner ? '👑' : '🥵'}</span>
            <span style={{ fontFamily: 'var(--font-orbitron)', color: color, fontSize: '14px', fontWeight: 900, letterSpacing: '0.5px' }}>
              {banner}
            </span>
            <span style={{ fontSize: '11px', color: '#cbd5e1', maxWidth: '320px', lineHeight: 1.4 }}>
              {msg}
            </span>
            {isWinner ? (
              <button 
                className="console-btn" 
                onClick={onOpenClaim}
                style={{ 
                  margin: 0, 
                  padding: '10px 20px', 
                  fontSize: '11px', 
                  width: 'auto', 
                  background: 'linear-gradient(180deg, var(--neon-gold), #b45309)', 
                  borderColor: 'var(--neon-gold)', 
                  fontWeight: 'bold', 
                  animation: 'pulseAlert 2s infinite' 
                }}
              >
                RECLAMAR RECOMPENSAS WEB3 🏆
              </button>
            ) : (
              <button 
                className="console-btn" 
                onClick={onBackToLobby}
                style={{ margin: 0, padding: '8px 16px', fontSize: '11px', width: 'auto' }}
              >
                VOLVER AL LOBBY
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Por defecto (Lobby)
  return (
    <div className="combat-control-center" style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
      {lobbyStatus === 'searching' ? (
        <div className="horizontal-console-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
          <div className="searching-status-block" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div className="audit-spinner-small"></div>
            <span className="searching-text" style={{ fontSize: '11px', fontFamily: 'Orbitron' }}>
              RASTREANDO RED DESCENTRALIZADA... Tiempo: <strong>{matchmakingTime}s</strong>
            </span>
          </div>
          <button 
            className="console-btn btn-secondary" 
            onClick={onCancelMatchmaking}
            style={{ margin: 0, padding: '8px 16px', width: 'auto', fontSize: '11px' }}
          >
            CANCELAR BÚSQUEDA
          </button>
        </div>
      ) : (
        <div className="horizontal-console-row" style={{ display: 'flex', flexDirection: 'column', gap: '12px', width: '100%' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', flexWrap: 'wrap', gap: '10px' }}>
            <div style={{ textAlign: 'left', flex: 1, minWidth: '240px' }}>
              <span style={{ fontFamily: 'Orbitron', fontWeight: 700, fontSize: '12px', color: 'var(--neon-gold)' }}>
                ⚔️ ARENA DE ENFRENTAMIENTOS CRIPTOGRÁFICOS
              </span>
              <p style={{ fontSize: '10px', color: '#94a3b8', margin: '2px 0 0 0' }}>
                Prepara tu mesa secreta arriba y presiona Iniciar Matchmaking para buscar un rival en la red Midnight L2.
              </p>
            </div>
            <button 
              className="console-btn" 
              onClick={onStartMatchmaking}
              style={{ margin: 0, padding: '10px 24px', width: 'auto', fontFamily: 'Orbitron', fontWeight: 'bold' }}
            >
              BUSCAR RIVAL EN LÍNEA ⚡
            </button>
          </div>

          {/* Fila de Depuración de WebSocket */}
          <div className="ws-debug-row" style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '100%', background: 'rgba(0,0,0,0.3)', padding: '8px 12px', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
            <span style={{ fontSize: '9px', fontFamily: 'Orbitron', color: isWSConnected ? '#10b981' : '#f43f5e', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%', background: isWSConnected ? '#10b981' : '#f43f5e' }}></span>
              {isWSConnected ? 'WS CONECTADO' : 'WS DESCONECTADO'}
            </span>
            <input 
              type="text" 
              value={wsUrl} 
              onChange={(e) => onWsUrlChange(e.target.value)} 
              placeholder="ws://localhost:8080/ws"
              style={{ 
                flex: 1, 
                background: 'rgba(0,0,0,0.6)', 
                border: '1px solid rgba(255,255,255,0.15)', 
                color: '#fff', 
                fontSize: '10px', 
                padding: '5px 10px', 
                borderRadius: '5px',
                fontFamily: 'monospace',
                outline: 'none'
              }} 
            />
            {isWSConnected ? (
              <button 
                onClick={onDisconnectWS}
                className="console-btn btn-secondary"
                style={{ margin: 0, padding: '4px 12px', fontSize: '9px', width: 'auto', height: '26px' }}
              >
                DESCONECTAR
              </button>
            ) : (
              <button 
                onClick={onConnectWS}
                className="console-btn"
                style={{ margin: 0, padding: '4px 12px', fontSize: '9px', width: 'auto', height: '26px', background: 'var(--neon-gold)', borderColor: 'var(--neon-gold)', color: '#000', fontWeight: 'bold' }}
              >
                CONECTAR
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

