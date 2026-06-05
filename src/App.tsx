import React, { useState, useEffect, useCallback } from 'react';
import { HUD } from './components/HUD';
import { CombatConsole, RivalChef } from './components/CombatConsole';
import { Sidebar } from './components/Sidebar';
import { GameBoard } from './components/GameBoard';
import { Console, LogLine } from './components/Console';
import { useWebSockets } from './hooks/useWebSockets';
import { useWallet } from './hooks/useWallet';
import { useGameAPI } from './hooks/useGameAPI';
import { Friend, GameState } from './simulation';
import { PizzeriaAudio } from './audio';

export const App: React.FC = () => {
  // --- Estados de Juego ---
  const [gameState, setGameState] = useState<'lobby' | 'playing' | 'ended'>('lobby');
  const [lobbyStatus, setLobbyStatus] = useState<'idle' | 'searching' | 'ready'>('idle');
  const [matchmakingTime, setMatchmakingTime] = useState(0);
  const [turnTimer, setTurnTimer] = useState(15);
  const [playerHP, setPlayerHP] = useState(5);
  const [rivalHP, setRivalHP] = useState(5);
  const [playerScore, setPlayerScore] = useState(0);
  const [rivalScore, setRivalScore] = useState(0);
  const [playerImmunity, setPlayerImmunity] = useState(false);
  const [rivalImmunity, setRivalImmunity] = useState(false);
  const [isMultiplayerActive, setIsMultiplayerActive] = useState(false);
  const [playerTurn, setPlayerTurn] = useState(true);
  const [winner, setWinner] = useState<'player' | 'rival' | null>(null);

  // --- Oponente ---
  const [rivalChef, setRivalChef] = useState<RivalChef | null>(null);

  // --- Tableros ---
  const [playerBoard, setPlayerBoard] = useState<number[][]>(() => 
    Array(6).fill(null).map(() => Array(6).fill(0))
  );
  const [rivalBoard, setRivalBoard] = useState<number[][]>(() => 
    Array(6).fill(null).map(() => Array(6).fill(0))
  );
  const [playerRevealed, setPlayerRevealed] = useState<boolean[][]>(() => 
    Array(6).fill(null).map(() => Array(6).fill(false))
  );
  const [rivalRevealed, setRivalRevealed] = useState<boolean[][]>(() => 
    Array(6).fill(null).map(() => Array(6).fill(false))
  );

  // --- Inventario y Edición ---
  const [playerInventory, setPlayerInventory] = useState<{ [key: number]: number }>({
    5: 1, // Jalapeño
    6: 1, // Habanero
    7: 1, // Agua
    8: 1, // Leche
    9: 1  // Trufa
  });
  const [selectedEditCell, setSelectedEditCell] = useState<{ r: number; c: number } | null>(null);
  const [selectedInventoryItem, setSelectedInventoryItem] = useState<number | null>(null);

  // --- Amigos ---
  const [friends, setFriends] = useState<Friend[]>([
    { id: 'f1', name: 'Chef Pepperoni', status: 'En línea', emoji: '🧑‍🍳' },
    { id: 'f2', name: 'Mamma Margherita', status: 'Desconectado', emoji: '👩‍🍳' }
  ]);

  // --- Bitácora de Consola & ZK ---
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [zkLogs, setZkLogs] = useState<string[]>([]);
  const [merkleRoot, setMerkleRoot] = useState('mr_0x00000000000000000000000000000000');

  // --- Modales ---
  const [showRulesModal, setShowRulesModal] = useState(false);
  const [showClaimModal, setShowClaimModal] = useState(false);
  const [showUniverseOverlay, setShowUniverseOverlay] = useState(true);

  // --- Custom Hooks & WebSocket Config ---
  const [wsUrl, setWsUrl] = useState(() => (import.meta as any).env?.VITE_WS_URL || 'ws://localhost:8080/ws');
  const { isConnected: isWSConnected, connect: connectWS, disconnect: disconnectWS, sendMessage: sendWSMessage, lastMessage } = useWebSockets(wsUrl);
  const { isConnected: isWalletConnected, address: walletAddress, balance: walletBalance, connectWallet, disconnectWallet, signClaim } = useWallet();
  const { registerChef, submitBoardCommitment, sendBiteMove } = useGameAPI();

  // Función para agregar logs a la consola criptográfica
  const addLog = useCallback((text: string, type: 'system' | 'info' | 'success' | 'error' | 'warn' = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [...prev, { text, type, timestamp }]);
  }, []);

  // Agregar log ZK
  const addZKLog = useCallback((message: string) => {
    setZkLogs(prev => [...prev, message]);
  }, []);

  // Procesar mensajes del WebSocket para juego multijugador en tiempo real
  useEffect(() => {
    if (!lastMessage) return;
    const { type, payload } = lastMessage;

    switch (type) {
      case 'match_start':
      case 'match_found':
        addLog('⚡ ¡Oponente multijugador encontrado! Sincronizando mesa criptográfica...', 'success');
        setRivalChef(payload.rivalChef || {
          name: 'Cyber Pizzaiolo',
          emoji: '🤖',
          title: 'Midnight Rival',
          aggression: 4
        });
        setGameState('playing');
        setIsMultiplayerActive(true);
        setPlayerTurn(payload.playerTurn !== undefined ? payload.playerTurn : true);
        if (payload.rivalBoard) {
          setRivalBoard(payload.rivalBoard);
        }
        setLobbyStatus('ready');
        break;

      case 'bite_result': {
        const { r, c, val, rivalHP: newRivalHP, rivalScore: newRivalScore, playerTurn: nextTurn } = payload;
        PizzeriaAudio.playCrunch();
        
        setRivalBoard(prev => {
          const next = prev.map(row => [...row]);
          next[r][c] = val;
          return next;
        });
        setRivalRevealed(prev => {
          const next = prev.map(row => [...row]);
          next[r][c] = true;
          return next;
        });

        if (newRivalHP !== undefined) setRivalHP(newRivalHP);
        if (newRivalScore !== undefined) setRivalScore(newRivalScore);

        if (val === 5 || val === 6) {
          addLog(`💥 ¡Cuidado! Has mordido un chile trampa en [${r}, ${c}]!`, 'warn');
          PizzeriaAudio.playDisaster();
        } else if (val >= 7 && val <= 9) {
          addLog(`✨ ¡Has revelado un item especial en [${r}, ${c}]!`, 'success');
        } else if (val > 0) {
          addLog(`🎯 ¡Impacto directo! Revelaste una porción de pizza en [${r}, ${c}].`, 'success');
        } else {
          addLog(`💨 Agua. Mordisco vacío en [${r}, ${c}].`, 'info');
        }

        setPlayerTurn(nextTurn !== undefined ? nextTurn : false);
        break;
      }

      case 'rival_bite': {
        const { r, c, val, playerHP: newPlayerHP, playerScore: newPlayerScore, playerTurn: nextTurn } = payload;
        PizzeriaAudio.playCrunch();

        setPlayerRevealed(prev => {
          const next = prev.map(row => [...row]);
          next[r][c] = true;
          return next;
        });

        if (newPlayerHP !== undefined) setPlayerHP(newPlayerHP);
        if (newPlayerScore !== undefined) setPlayerScore(newPlayerScore);

        if (val === 5 || val === 6) {
          addLog(`🔥 ¡El rival ha mordido tu chile trampa en [${r}, ${c}]!`, 'success');
        } else if (val > 0) {
          addLog(`💥 El rival mordió tu pizza en [${r}, ${c}].`, 'error');
        } else {
          addLog(`🛡️ El rival falló su mordisco en [${r}, ${c}].`, 'info');
        }

        setPlayerTurn(nextTurn !== undefined ? nextTurn : true);
        break;
      }

      case 'game_over':
        addLog(`🏆 Partida finalizada. Ganador: ${payload.winner === 'player' ? 'Tú' : 'El rival'}.`, payload.winner === 'player' ? 'success' : 'error');
        setWinner(payload.winner);
        setGameState('ended');
        if (payload.winner === 'player') {
          PizzeriaAudio.playFanfare();
        } else {
          PizzeriaAudio.playDisaster();
        }
        break;

      case 'error':
        addLog(`🚨 Error en servidor multijugador: ${payload.message || 'Desconocido'}`, 'error');
        break;

      default:
        console.log('Mensaje WebSocket no manejado:', type, payload);
    }
  }, [lastMessage, addLog]);

  // Si se conecta el WS y estamos buscando oponente, enviar evento de inicio de matchmaking
  useEffect(() => {
    if (isWSConnected && lobbyStatus === 'searching') {
      addLog('🔌 Conectado a Go API WebSocket. Buscando oponente...', 'success');
      sendWSMessage('start_matchmaking', {
        chefId: walletAddress || 'Pizzaiolo_Anonimo',
        merkleRoot: merkleRoot,
        board: playerBoard
      });
    }
  }, [isWSConnected, lobbyStatus, walletAddress, merkleRoot, playerBoard, sendWSMessage, addLog]);

  // Simulación: Cargar tablero de prueba
  useEffect(() => {
    const defaultBoard = [
      [1, 0, 0, 2, 2, 0],
      [0, 0, 0, 0, 0, 0],
      [3, 3, 0, 0, 0, 5],
      [3, 3, 0, 4, 4, 4],
      [0, 0, 0, 4, 0, 0],
      [0, 9, 8, 0, 0, 0]
    ];
    setPlayerBoard(defaultBoard);
    setRivalBoard(defaultBoard);
    
    addLog('Inicializando arena de Clash of Pizzas: Spicy Challenge...', 'system');
    addLog('Sincronizando Shielded Board local en la red descentralizada Midnight.', 'system');
    addLog('Bienvenido, Pizzaiolo. Coloca tus chiles trampa y desafía a tus rivales.', 'info');
  }, [addLog]);

  // Manejar el inicio de matchmaking
  const handleStartMatchmaking = () => {
    PizzeriaAudio.playClick();
    setLobbyStatus('searching');
    addLog('Buscando oponente calificado en Midnight L2...', 'info');
    
    if (!isWSConnected) {
      connectWS(wsUrl);
    } else {
      sendWSMessage('start_matchmaking', {
        chefId: walletAddress || 'Pizzaiolo_Anonimo',
        merkleRoot: merkleRoot,
        board: playerBoard
      });
    }
  };

  // Cancelar matchmaking
  const handleCancelMatchmaking = () => {
    PizzeriaAudio.playClick();
    setLobbyStatus('idle');
    addLog('Matchmaking cancelado.', 'system');
    if (isWSConnected) {
      sendWSMessage('cancel_matchmaking', {});
      disconnectWS();
    }
  };

  const handleForfeit = () => {
    PizzeriaAudio.playDisaster();
    setWinner('rival');
    setGameState('ended');
    setPlayerHP(0);
    addLog('🏳️ Te has rendido. El rival devoró las rebanadas restantes y ganó.', 'error');
  };

  const handleBackToLobby = () => {
    PizzeriaAudio.playClick();
    setGameState('lobby');
    setLobbyStatus('idle');
    setPlayerHP(5);
    setRivalHP(5);
    setWinner(null);
  };

  const handleOpenClaim = () => {
    PizzeriaAudio.playClick();
    setShowClaimModal(true);
  };

  const handleCopyChallengeLink = () => {
    PizzeriaAudio.playClick();
    navigator.clipboard.writeText(window.location.href + `?challenge=${merkleRoot}`);
    addLog('🔗 Enlace de reto P2P copiado al portapapeles con éxito.', 'success');
  };

  const handleAddFriend = (name: string) => {
    PizzeriaAudio.playClick();
    const newFriend: Friend = {
      id: `f_${Date.now()}`,
      name,
      status: 'En línea',
      emoji: '🍳'
    };
    setFriends(prev => [...prev, newFriend]);
    addLog(`➕ Chef ${name} agregado a tu lista de amigos.`, 'success');
  };

  const handleChallengeFriend = (id: string) => {
    PizzeriaAudio.playClick();
    const friend = friends.find(f => f.id === id);
    if (!friend) return;
    addLog(`⚔️ Desafiando a ${friend.name} a un duelo privado ZK...`, 'info');
    
    // Iniciar juego simulado
    setRivalChef({
      name: friend.name,
      emoji: friend.emoji,
      title: 'Desafiante Local',
      aggression: 3
    });
    setGameState('playing');
  };

  // Manejar clic en una celda
  const handleCellClick = (r: number, c: number) => {
    if (gameState !== 'playing') {
      addLog(`Click en celda [${r}, ${c}] - Configurando tablero...`, 'info');
      return;
    }

    // Ataque
    if (playerTurn) {
      if (rivalRevealed[r][c]) {
        addLog('⚠️ Ya has mordido esta casilla. Elige otra.', 'warn');
        return;
      }

      if (isMultiplayerActive) {
        addLog(`🎯 Enviando mordisco en celda [${r}, ${c}] por WebSocket...`, 'info');
        sendWSMessage('bite', { r, c });
      } else {
        PizzeriaAudio.playCrunch();
        const newRevealed = rivalRevealed.map((row, ri) => 
          row.map((val, ci) => ri === r && ci === c ? true : val)
        );
        setRivalRevealed(newRevealed);
        addLog(`🎯 Mordisco local en celda [${r}, ${c}]`, 'success');
        
        // Simular cambio de turno
        setPlayerTurn(false);
        setTimeout(() => {
          setPlayerTurn(true);
          addLog('👉 Es tu turno de morder.', 'info');
        }, 1500);
      }
    }
  };

  return (
    <div className="arena-dashboard">
      {/* Cinematic Entry Landing Portal Page */}
      {showUniverseOverlay && (
        <div className="landing-overlay" id="landingOverlay">
          <div className="landing-content">
            <div className="landing-badge">🔥 MIDNIGHT ZK ARENA 🔥</div>
            <h1 className="landing-title">CLASH OF PIZZAS</h1>
            <h2 className="landing-subtitle">Spicy Challenge</h2>
            <p className="landing-description">
              Ingresa a un universo descentralizado donde las pizzas son secretas y los mordiscos son auditados en tiempo real en la blockchain L2 Midnight mediante pruebas de conocimiento cero (ZK Proofs).
            </p>
            <button 
              className="landing-btn" 
              onClick={() => {
                PizzeriaAudio.playFanfare();
                setShowUniverseOverlay(false);
              }}
            >
              INGRESAR AL UNIVERSO ⚔️
            </button>
            <div className="landing-footer">PIZZADAO • SHIELDED CRYPTO BOARD GAME</div>
          </div>
        </div>
      )}

      {/* HUD Superior */}
      <HUD 
        chefScore={playerScore}
        gasFee={walletBalance?.dust || '0.00'}
        isWalletConnected={isWalletConnected}
        walletAddress={walletAddress}
        onConnectWallet={connectWallet}
        onDisconnectWallet={disconnectWallet}
        onOpenRules={() => setShowRulesModal(true)}
        playerHP={playerHP}
        rivalHP={rivalHP}
        rivalName={rivalChef?.name}
      />

      {/* Combat Control Center */}
      <CombatConsole 
        gameState={gameState}
        lobbyStatus={lobbyStatus}
        rivalChef={rivalChef}
        playerTurn={playerTurn}
        isMultiplayerActive={isMultiplayerActive}
        matchmakingTime={matchmakingTime}
        turnTimer={turnTimer}
        onStartMatchmaking={handleStartMatchmaking}
        onCancelMatchmaking={handleCancelMatchmaking}
        onForfeit={handleForfeit}
        onBackToLobby={handleBackToLobby}
        onOpenClaim={handleOpenClaim}
        winner={winner}
        wsUrl={wsUrl}
        onWsUrlChange={setWsUrl}
        isWSConnected={isWSConnected}
        onConnectWS={() => connectWS(wsUrl)}
        onDisconnectWS={disconnectWS}
      />

      {/* Middle Arena Body Container */}
      <div className="middle-arena-row" style={{ display: 'flex', gap: '20px', marginTop: '15px' }}>
        <main className="battlefield-container" style={{ display: 'flex', gap: '20px', flex: 1 }}>
          
          {/* Tablero de Defensa (Jugador) */}
          <GameBoard 
            board={playerBoard}
            revealed={playerRevealed}
            isPlayer={true}
            score={playerScore}
            hasImmunity={playerImmunity}
            selectedEditCell={selectedEditCell}
            selectedInventoryItem={selectedInventoryItem}
            onCellClick={(r, c) => addLog(`Tablero del Jugador celda clickeada: [${r}, ${c}]`, 'info')}
            onShuffleBoard={() => {
              PizzeriaAudio.playClick();
              addLog('Tablero mezclado de forma aleatoria y hash regenerado.', 'success');
            }}
            showShuffleButton={gameState === 'lobby'}
          />

          {/* Tablero de Ataque (Rival) */}
          <GameBoard 
            board={rivalBoard}
            revealed={rivalRevealed}
            isPlayer={false}
            score={rivalScore}
            hasImmunity={rivalImmunity}
            selectedEditCell={null}
            selectedInventoryItem={null}
            onCellClick={handleCellClick}
          />
        </main>

        {/* Sidebar Derecha */}
        <Sidebar 
          friends={friends}
          onAddFriend={handleAddFriend}
          onChallengeFriend={handleChallengeFriend}
          onCopyChallengeLink={handleCopyChallengeLink}
          merkleRoot={merkleRoot}
          zkLogs={zkLogs}
        />
      </div>

      {/* Consola Inferior */}
      <Console logs={logs} />

      {/* Modal de Reglas */}
      {showRulesModal && (
        <div className="modal-overlay active">
          <div className="modal-card" style={{ width: '550px', maxHeight: '85vh', overflowY: 'auto', background: 'linear-gradient(135deg, #111827, #030712)', border: '2px solid var(--neon-gold)', borderRadius: '20px' }}>
            <div className="modal-header" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', padding: '15px 25px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontFamily: 'Orbitron', color: 'var(--neon-gold)', fontWeight: 900, fontSize: '14px', margin: 0 }}>💡 REGLAS DE SPICY CHALLENGE</h2>
              <button className="modal-close-btn" onClick={() => setShowRulesModal(false)} style={{ color: 'var(--neon-gold)', fontSize: '24px', cursor: 'pointer', background: 'none', border: 'none' }}>×</button>
            </div>
            <div className="modal-body" style={{ textAlign: 'left', display: 'flex', flexDirection: 'column', gap: '15px', padding: '25px', fontSize: '11.5px', color: '#cbd5e1', lineHeight: '1.5' }}>
              <div style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '12px', padding: '12px' }}>
                <p><strong>1. Posiciones Secretas:</strong> Cada chef dispone sus pizzas y chiles de forma secreta en una grilla de 6x6. Nadie puede ver el tablero del otro al comenzar.</p>
                <p style={{ marginTop: '6px' }}><strong>2. Las Pizzas:</strong> Margherita (1x1), Pepperoni (1x2), Suprema (2x2) y la gigantesca <strong>Pizza Gigante</strong>.</p>
                <p style={{ marginTop: '6px' }}><strong>3. Daño de Devastación:</strong> Si consigues comerte una pizza rival completa, asestarás un golpe directo a su vida.</p>
                <p style={{ marginTop: '6px' }}><strong>4. Chiles y Curas:</strong> El Jalapeño te quita -1 HP y el Habanero -2 HP. Bebe Agua (+1 HP) o Leche (+2 HP), o la Trufa de Oro para obtener +500 pts e inmunidad.</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
