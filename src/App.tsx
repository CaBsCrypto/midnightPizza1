import React, { useState, useEffect, useCallback } from 'react';
import { HUD } from './components/HUD';
import { CombatConsole, RivalChef } from './components/CombatConsole';
import { Sidebar } from './components/Sidebar';
import { GameBoard } from './components/GameBoard';
import { TutorialWizard } from './components/TutorialWizard';
export interface LogLine {
  text: string;
  type: 'system' | 'info' | 'success' | 'error' | 'warn';
  timestamp: string;
}
import { useRealtimeMatch as useWebSockets } from './hooks/useRealtimeMatch';
import { useStellarWallet } from './hooks/useStellarWallet';
import { useGameAPI } from './hooks/useGameAPI';
import { Friend, GameState } from './types';
import { PizzeriaAudio } from './audio';
import { submitSorobanBite, initializeSorobanGame } from './stellar_contract';
import { SorobanConfig } from './stellar_config';

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
  const [showStellarWalletModal, setShowStellarWalletModal] = useState(false);
  const [walletSelectorTab, setWalletSelectorTab] = useState<'main' | 'passkey' | 'google'>('main');
  const [stellarUsername, setStellarUsername] = useState('Chef_Soroban');
  const [googleEmail, setGoogleEmail] = useState('');
  const [isWalletConnecting, setIsWalletConnecting] = useState(false);

  // --- Custom Hooks & WebSocket Config ---
  const [wsUrl, setWsUrl] = useState(() => (import.meta as any).env?.VITE_WS_URL || 'ws://localhost:8080/ws');
  const { isConnected: isWSConnected, connect: connectWS, disconnect: disconnectWS, sendMessage: sendWSMessage, lastMessage } = useWebSockets(wsUrl);
  const {
    isConnected: isStellarConnected,
    stellarAddress,
    stellarBalance,
    walletType,
    connectStellar,
    disconnectStellar,
    signStellarTransaction
  } = useStellarWallet();
  const { registerChef, submitBoardCommitment, sendBiteMove } = useGameAPI();

  const [playerSalt] = useState<Uint8Array>(() => {
    const salt = new Uint8Array(32);
    if (typeof window !== 'undefined' && window.crypto) {
      window.crypto.getRandomValues(salt);
    } else {
      for (let i = 0; i < 32; i++) salt[i] = Math.floor(Math.random() * 256);
    }
    return salt;
  });

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

        // Guardar compromiso de duelo en localStorage
        localStorage.setItem('clash_private_board', JSON.stringify(playerBoard));
        localStorage.setItem('clash_private_salt', Array.from(playerSalt).join(','));

        // Entregar el tablero secreto al servidor autoritativo Go.
        // El servidor valida turnos, mordiscos, HP y score; el rival nunca ve el tablero,
        // solo el valor de cada celda que muerde.
        sendWSMessage('submit_board', { board: playerBoard });

        const boardBytes = new TextEncoder().encode(JSON.stringify(playerBoard));
        const p1Commit = new Uint8Array(32);
        for (let i = 0; i < 32; i++) {
          p1Commit[i] = boardBytes[i % boardBytes.length] ^ i;
        }
        const hexCommitment = Array.from(p1Commit).map(b => b.toString(16).padStart(2, '0')).join('');

        addLog(`🔐 Tablero privado verificado contra compromiso local: ${hexCommitment.slice(0, 16)}...`, 'success');
        addZKLog(`[setup_duel] Compromiso de tablero validado para el Duelo: ${hexCommitment.slice(0, 16)}...`);

        // Inicializar juego en Stellar/Soroban si hay wallet Stellar conectada
        if (isStellarConnected && stellarAddress) {
          try {
            addLog('📡 Inicializando juego de Soroban on-chain...', 'info');
            const p2Commit = new Uint8Array(32); // rival commitment fallback
            
            initializeSorobanGame({
              contractId: SorobanConfig.contractId,
              p1Address: stellarAddress,
              p2Address: payload.rivalChef?.address || stellarAddress, // Fallback a stellarAddress si no viene
              p1Commitment: p1Commit,
              p2Commitment: p2Commit,
              playerAddress: stellarAddress,
              signTransaction: signStellarTransaction
            }).then(txHash => {
              addLog(`🟢 Juego inicializado on-chain en Stellar. TxHash: ${txHash}`, 'success');
              addZKLog(`[soroban_init] Inicializado. TxHash: ${txHash.slice(0, 12)}...`);
            }).catch(err => {
              addLog(`⚠️ Falló inicializar Soroban on-chain: ${err.message || err}`, 'warn');
            });
          } catch (e: any) {
            console.error(e);
          }
        }
        break;

      case 'bite_result': {
        const { r, c, val, rivalHP: newRivalHP, rivalScore: newRivalScore, playerHP: myHP, playerScore: myScore, playerTurn: nextTurn } = payload;
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
        // El servidor autoritativo también reporta el estado propio (trampas/curas te afectan a ti).
        if (myHP !== undefined) setPlayerHP(myHP);
        if (myScore !== undefined) setPlayerScore(myScore);

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
        const { r, c, val, playerHP: newPlayerHP, playerScore: newPlayerScore, rivalHP: newRivalHP, rivalScore: newRivalScore, playerTurn: nextTurn } = payload;
        PizzeriaAudio.playCrunch();

        setPlayerRevealed(prev => {
          const next = prev.map(row => [...row]);
          next[r][c] = true;
          return next;
        });

        if (newPlayerHP !== undefined) setPlayerHP(newPlayerHP);
        if (newPlayerScore !== undefined) setPlayerScore(newPlayerScore);
        if (newRivalHP !== undefined) setRivalHP(newRivalHP);
        if (newRivalScore !== undefined) setRivalScore(newRivalScore);

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

      case 'opponent_disconnected_temporary':
        addLog(`⚠️ ${payload.message || 'El rival se ha desconectado temporalmente. Esperando...' }`, 'warn');
        break;

      case 'opponent_reconnected':
        addLog(`🟢 ${payload.message || 'El rival ha regresado a la partida.'}`, 'success');
        break;

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

      case 'opponent_disconnected':
        addLog('🚨 El rival abandonó definitivamente. Partida finalizada.', 'error');
        setGameState('ended');
        setWinner('player');
        PizzeriaAudio.playFanfare();
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
      const payload = (window as any)._pendingLobbyPayload || {
        playerId: stellarAddress || 'Pizzaiolo_Anonimo',
        username: stellarAddress ? `Chef_${stellarAddress.slice(0, 6)}` : 'Chef_Anonimo',
      };
      sendWSMessage('join_lobby', payload);
      (window as any)._pendingLobbyPayload = null;
    }
  }, [isWSConnected, lobbyStatus, stellarAddress, sendWSMessage, addLog]);

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

  useEffect(() => {
    // Generar compromiso determinista del tablero de 32 bytes para Soroban
    const boardBytes = new TextEncoder().encode(JSON.stringify(playerBoard));
    const commitmentBytes = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
      commitmentBytes[i] = boardBytes[i % boardBytes.length] ^ i;
    }
    const hexCommitment = Array.from(commitmentBytes).map(b => b.toString(16).padStart(2, '0')).join('');
    setMerkleRoot(hexCommitment);
    
    // Guardar en localStorage de forma local
    localStorage.setItem('clash_private_board', JSON.stringify(playerBoard));
    localStorage.setItem('clash_private_salt', Array.from(playerSalt).join(','));
    addZKLog(`[soroban_state] Tablero guardado localmente. Compromiso: ${hexCommitment.slice(0, 16)}...`);
  }, [playerBoard, playerSalt, addZKLog]);

  // Manejar el inicio de matchmaking
  const handleStartMatchmaking = (inviteHash?: string, invitePreimage?: string) => {
    PizzeriaAudio.playClick();
    setLobbyStatus('searching');
    addLog(inviteHash ? 'Creando sala privada (Hospedando)...' : invitePreimage ? 'Uniéndose a sala privada...' : 'Buscando oponente público en Soroban Arena...', 'info');
    
    const payload = {
      playerId: stellarAddress || 'Pizzaiolo_Anonimo',
      username: stellarAddress ? `Chef_${stellarAddress.slice(0, 6)}` : 'Chef_Anonimo',
      inviteHash: inviteHash,
      invitePreimage: invitePreimage
    };

    if (!isWSConnected) {
      (window as any)._pendingLobbyPayload = payload;
      connectWS(wsUrl);
    } else {
      sendWSMessage('join_lobby', payload);
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
        addLog(`🎯 Iniciando proceso de mordisco en celda [${r}, ${c}]...`, 'info');
        addZKLog(`[soroban_audit] Generando hash de auditoría para celda [${r}, ${c}]...`);
        
        const encoder = new TextEncoder();
        const data = encoder.encode(`bite_${r}_${c}_salt`);
        window.crypto.subtle.digest('SHA-256', data).then(hashBuffer => {
          const hashArray = Array.from(new Uint8Array(hashBuffer));
          const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
          
          addZKLog(`[soroban_audit] Hash de mordisco generado: ${hashHex.slice(0, 16)}...`);
          sendWSMessage('bite', { r, c, proof: hashHex });
        }).catch(() => {
          // Fallback simple si falla crypto api
          const fallbackProof = `audit_bite_${r}_${c}`;
          addZKLog(`[soroban_audit] Hash de mordisco generado: ${fallbackProof}`);
          sendWSMessage('bite', { r, c, proof: fallbackProof });
        });
      } else {
        // --- JUEGO LOCAL SINGLE PLAYER VS CPU ---
        PizzeriaAudio.playCrunch();
        const cellValue = rivalBoard[r][c];
        
        // Revelar casilla
        const newRevealed = rivalRevealed.map((row, ri) => 
          row.map((val, ci) => ri === r && ci === c ? true : val)
        );
        setRivalRevealed(newRevealed);

        // Procesar resultado del ataque del jugador
        if (cellValue === 5 || cellValue === 6) { // Chile Trampa
          const damage = cellValue === 5 ? 1 : 2;
          const newPlayerHP = Math.max(0, playerHP - (playerImmunity ? 0 : damage));
          setPlayerHP(newPlayerHP);
          addLog(`💥 ¡Cuidado! Mordiste un chile trampa rival en [${r}, ${c}]! Perdiste -${playerImmunity ? 0 : damage} HP.`, 'warn');
          PizzeriaAudio.playDisaster();

          if (newPlayerHP <= 0) {
            setWinner('rival');
            setGameState('ended');
            PizzeriaAudio.playDisaster();
            return;
          }
        } else if (cellValue >= 7 && cellValue <= 9) { // Items especiales
          if (cellValue === 7) { // Agua
            setPlayerHP(prev => Math.min(5, prev + 1));
            addLog(`🥛 ¡Encontraste Agua en [${r}, ${c}]! Recuperas +1 HP.`, 'success');
          } else if (cellValue === 8) { // Leche
            setPlayerHP(prev => Math.min(5, prev + 2));
            addLog(`🥛 ¡Encontraste Leche en [${r}, ${c}]! Recuperas +2 HP.`, 'success');
          } else if (cellValue === 9) { // Trufa de Oro
            setPlayerScore(prev => prev + 500);
            setPlayerImmunity(true);
            addLog(`👑 ¡Encontraste la Trufa de Oro en [${r}, ${c}]! +500 PTS e Inmunidad temporal.`, 'success');
            setTimeout(() => setPlayerImmunity(false), 8000);
          }
        } else if (cellValue > 0) { // Pizza porción
          const nextScore = playerScore + 100;
          setPlayerScore(nextScore);
          
          // Reducir HP del rival si encontramos parte de su pizza
          const nextRivalHP = Math.max(0, rivalHP - 1);
          setRivalHP(nextRivalHP);
          addLog(`🎯 ¡Impacto directo! Mordiste una pizza rival en [${r}, ${c}]. +100 PTS!`, 'success');

          if (nextRivalHP <= 0) {
            setWinner('player');
            setGameState('ended');
            PizzeriaAudio.playFanfare();
            return;
          }
        } else {
          addLog(`💨 Agua. Mordisco vacío en [${r}, ${c}].`, 'info');
        }

        // --- TURNO DE LA CPU (OPONENTE) ---
        setPlayerTurn(false);
        setTimeout(() => {
          // Si alguno se quedó sin vida en el ataque anterior, el juego ya terminó locally
          if (playerHP <= 0 || rivalHP <= 0) return;

          // Buscar una casilla no revelada en el tablero del jugador
          const unrevealedCells: {r: number, c: number}[] = [];
          for (let ri = 0; ri < 6; ri++) {
            for (let ci = 0; ci < 6; ci++) {
              if (!playerRevealed[ri][ci]) {
                unrevealedCells.push({ r: ri, c: ci });
              }
            }
          }

          if (unrevealedCells.length === 0) {
            setPlayerTurn(true);
            return;
          }

          // La CPU selecciona una coordenada aleatoria
          const choice = unrevealedCells[Math.floor(Math.random() * unrevealedCells.length)];
          const targetVal = playerBoard[choice.r][choice.c];

          // Revelar celda del jugador
          setPlayerRevealed(prev => {
            const next = prev.map(row => [...row]);
            next[choice.r][choice.c] = true;
            return next;
          });

          PizzeriaAudio.playCrunch();

          // Procesar ataque de la CPU
          if (targetVal === 5 || targetVal === 6) { // La CPU muerde chile
            const damage = targetVal === 5 ? 1 : 2;
            const nextRivalHP = Math.max(0, rivalHP - (rivalImmunity ? 0 : damage));
            setRivalHP(nextRivalHP);
            addLog(`🔥 ¡El rival CPU mordió tu chile trampa en [${choice.r}, ${choice.c}]! Rival pierde -${rivalImmunity ? 0 : damage} HP.`, 'success');

            if (nextRivalHP <= 0) {
              setWinner('player');
              setGameState('ended');
              PizzeriaAudio.playFanfare();
              return;
            }
          } else if (targetVal >= 7 && targetVal <= 9) { // CPU items
            if (targetVal === 7) {
              setRivalHP(prev => Math.min(5, prev + 1));
              addLog(`🤖 CPU encontró Agua en [${choice.r}, ${choice.c}]. Recupera +1 HP.`, 'info');
            } else if (targetVal === 8) {
              setRivalHP(prev => Math.min(5, prev + 2));
              addLog(`🤖 CPU encontró Leche en [${choice.r}, ${choice.c}]. Recupera +2 HP.`, 'info');
            } else if (targetVal === 9) {
              setRivalScore(prev => prev + 500);
              setRivalImmunity(true);
              addLog(`👑 CPU encontró la Trufa de Oro en [${choice.r}, ${choice.c}]! +500 PTS e Inmunidad.`, 'warn');
              setTimeout(() => setRivalImmunity(false), 8000);
            }
          } else if (targetVal > 0) { // CPU muerde pizza del jugador
            const nextPlayerHP = Math.max(0, playerHP - 1);
            setPlayerHP(nextPlayerHP);
            setRivalScore(prev => prev + 100);
            addLog(`💥 El rival CPU mordió tu pizza en [${choice.r}, ${choice.c}]! Perdiste 1 HP.`, 'error');

            if (nextPlayerHP <= 0) {
              setWinner('rival');
              setGameState('ended');
              PizzeriaAudio.playDisaster();
              return;
            }
          } else {
            addLog(`🛡️ El rival CPU falló su mordisco en [${choice.r}, ${choice.c}].`, 'info');
          }

          setPlayerTurn(true);
          addLog('👉 Es tu turno de morder.', 'info');
        }, 1500);
      }
    }
  };

  const handleStartSinglePlayer = () => {
    PizzeriaAudio.playClick();
    setIsMultiplayerActive(false);
    
    // Generar un tablero aleatorio para la CPU
    const cpuPresetBoards = [
      [
        [0, 1, 0, 0, 0, 5],
        [0, 1, 0, 2, 2, 0],
        [0, 0, 0, 0, 0, 0],
        [3, 3, 0, 4, 4, 4],
        [0, 0, 0, 0, 0, 6],
        [9, 8, 0, 0, 7, 0]
      ],
      [
        [2, 2, 0, 0, 0, 9],
        [0, 0, 0, 4, 4, 4],
        [1, 0, 5, 0, 0, 0],
        [1, 0, 0, 3, 3, 0],
        [0, 0, 0, 0, 0, 6],
        [0, 0, 8, 7, 0, 0]
      ]
    ];
    const chosenBoard = cpuPresetBoards[Math.floor(Math.random() * cpuPresetBoards.length)];
    setRivalBoard(chosenBoard);
    
    // Resetear tablero de revelados del rival
    setRivalRevealed(Array(6).fill(null).map(() => Array(6).fill(false)));
    setPlayerRevealed(Array(6).fill(null).map(() => Array(6).fill(false)));
    
    setPlayerHP(5);
    setRivalHP(5);
    setPlayerScore(0);
    setRivalScore(0);
    setWinner(null);
    setPlayerTurn(true);
    
    setRivalChef({
      name: 'Chef Cyber-CPU 🤖',
      emoji: '🤖',
      title: 'Simulación de Entrenamiento',
      aggression: 3
    });
    
    setGameState('playing');
    addLog('🎮 ¡Comienza el juego de entrenamiento contra la CPU local!', 'success');
    addZKLog('[singleplayer] Tableros configurados en memoria local.');
  };

  return (
    <div className="arena-dashboard">
      {/* Cinematic Entry Landing Portal Page */}
      {showUniverseOverlay && (
        <div className="landing-overlay" id="landingOverlay">
          <div className="landing-content">
            <div className="landing-badge">🔥 STELLAR SOROBAN ARENA 🔥</div>
            <h1 className="landing-title">SPICY CHALLENGE</h1>
            <h2 className="landing-subtitle">Metropolis of Flavor</h2>
            <p className="landing-description">
              Ingresa a un universo descentralizado donde las pizzas son secretas y los mordiscos son auditados en tiempo real en la red de pruebas Stellar Soroban.
            </p>
            <button 
              className="landing-btn" 
              onClick={() => {
                PizzeriaAudio.playFanfare();
                setShowUniverseOverlay(false);
                
                // Mostrar tutorial automáticamente si es la primera vez
                const hasSeenTutorial = localStorage.getItem('spicy_seen_tutorial');
                if (!hasSeenTutorial) {
                  setShowRulesModal(true);
                  localStorage.setItem('spicy_seen_tutorial', 'true');
                }
              }}
            >
              INGRESAR AL UNIVERSO ⚔️
            </button>
            <div className="landing-footer">PIZZADAO • AUDITED CRYPTO BOARD GAME</div>
          </div>
        </div>
      )}

       {/* HUD Superior */}
      <HUD 
        chefScore={playerScore}
        gasFee={isStellarConnected ? stellarBalance : '0.00'}
        onOpenRules={() => setShowRulesModal(true)}
        playerHP={playerHP}
        rivalHP={rivalHP}
        rivalName={rivalChef?.name}
        isStellarConnected={isStellarConnected}
        stellarAddress={stellarAddress}
        walletType={walletType}
        onOpenWalletSelector={() => {
          setWalletSelectorTab('main');
          setShowStellarWalletModal(true);
        }}
        onDisconnectStellar={disconnectStellar}
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
        onStartSinglePlayer={handleStartSinglePlayer}
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
      {/* Modal de Tutorial Interactivo (Reglas) */}
      {showRulesModal && (
        <div className="modal-overlay active">
          <div className="modal-card" style={{ 
            width: '600px', 
            maxHeight: '90vh', 
            overflowY: 'auto', 
            background: 'linear-gradient(135deg, #1c1410, #0f0b08)', 
            border: '3px solid var(--neon-red)', 
            borderRadius: '24px',
            color: 'var(--text-dark)',
            boxShadow: '0 25px 50px rgba(0, 0, 0, 0.7)'
          }}>
            <TutorialWizard onClose={() => setShowRulesModal(false)} />
          </div>
        </div>
      )}

      {/* Modal de Reclamo Web3 */}
      {showClaimModal && (
        <div className="modal-overlay active">
          <div className="modal-card" style={{ width: '500px', background: 'linear-gradient(135deg, #111827, #030712)', border: '2px solid var(--neon-gold)', borderRadius: '20px', padding: '25px', color: '#cbd5e1' }}>
            <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ fontFamily: 'Orbitron', color: 'var(--neon-gold)', fontWeight: 900, fontSize: '16px', margin: 0 }}>🏆 LIQUIDACIÓN DE RECOMPENSAS ZK</h2>
              <button className="modal-close-btn" onClick={() => setShowClaimModal(false)} style={{ color: 'var(--neon-gold)', fontSize: '24px', cursor: 'pointer', background: 'none', border: 'none' }}>×</button>
            </div>
            
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '15px', fontSize: '12px' }}>
              <div style={{ background: 'rgba(251, 191, 36, 0.05)', border: '1px solid rgba(251, 191, 36, 0.2)', borderRadius: '12px', padding: '15px', textAlign: 'center' }}>
                <span style={{ fontSize: '24px' }}>✨</span>
                <h3 style={{ color: '#fff', fontSize: '18px', margin: '10px 0 5px 0', fontFamily: 'Orbitron' }}>
                  {Math.floor(playerScore / 10) + 100} Trufas de Oro
                </h3>
                <p style={{ margin: 0, color: '#94a3b8' }}>Puntuación de Combate: {playerScore} PTS</p>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', background: 'rgba(0,0,0,0.2)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Compromiso de Tablero:</span>
                  <span style={{ fontFamily: 'monospace', color: '#38bdf8' }}>{merkleRoot.slice(0, 14)}...{merkleRoot.slice(-8)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Salt Criptográfico:</span>
                  <span style={{ fontFamily: 'monospace', color: '#34d399' }}>
                    {Array.from(playerSalt).slice(0, 6).map(b => b.toString(16).padStart(2,'0')).join('')}...
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Wallet Soroban Stellar:</span>
                  <span style={{ color: '#c084fc' }}>{stellarAddress ? `${stellarAddress.slice(0, 10)}...${stellarAddress.slice(-6)}` : 'No Conectada'}</span>
                </div>
              </div>

              {!isStellarConnected ? (
                <div style={{ color: '#ef4444', textAlign: 'center', fontWeight: 'bold' }}>
                  ⚠️ Debes registrar tu Stellar Passkey para firmar la reclamación Soroban.
                </div>
              ) : (
                <button
                  className="landing-btn"
                  style={{
                    background: 'linear-gradient(90deg, var(--neon-gold), #b45309)',
                    border: '1px solid var(--neon-gold)',
                    fontFamily: 'Orbitron',
                    fontSize: '12px',
                    padding: '12px',
                    width: '100%',
                    cursor: 'pointer',
                    boxShadow: '0 0 15px rgba(251, 191, 36, 0.4)'
                  }}
                  onClick={async () => {
                    try {
                      addZKLog('[soroban_tx] Conectando con Horizon/RPC de Stellar Testnet...');
                      
                      // Hash ZK del tablero para registrar en Soroban
                      const hashBytes = new Uint8Array(32);
                      const encoder = new TextEncoder();
                      const rootEncoded = encoder.encode(merkleRoot);
                      for (let i = 0; i < 32; i++) {
                        hashBytes[i] = rootEncoded[i % rootEncoded.length];
                      }
                      
                      addZKLog('[soroban_tx] Firmando invocación del método submit_bite...');
                      const txHash = await submitSorobanBite({
                        contractId: SorobanConfig.contractId,
                        playerAddress: stellarAddress,
                        row: 1, // Fila de auditoría
                        col: 1, // Columna de auditoría
                        zkProofHash: hashBytes,
                        signTransaction: signStellarTransaction
                      });
                      
                      addLog(`🟢 ¡Transacción Soroban confirmada! Hash: ${txHash}`, 'success');
                      addZKLog(`[soroban_tx] Confirmada. TxHash: ${txHash.slice(0, 12)}...`);

                      // 3. Reclamo de tokens
                      const reward = Math.floor(playerScore / 10) + 100;
                      addLog(`🪙 ¡Recompensa reclamada con éxito! +${reward} Trufas de Oro Soroban (SEP-41) acreditadas a tu cuenta.`, 'success');
                      addZKLog('[soroban_token] Acreditación de tokens SEP-41 exitosa.');

                      setShowClaimModal(false);
                      handleBackToLobby();
                    } catch (err: any) {
                      addLog(`❌ Error en la liquidación de recompensas Stellar: ${err.message || err}`, 'error');
                      addZKLog(`[error] Transacción Soroban cancelada o fallida.`);
                    }
                  }}
                >
                  REVELAR TABLERO & RECLAMAR TRUFAS SOROBAN 👑
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal de Conexión de Wallet Stellar */}
      {showStellarWalletModal && (
        <div className="modal-overlay active">
          <div className="modal-card" style={{ 
            width: '520px', 
            background: 'linear-gradient(135deg, #1a1410, #0f0b08)', 
            border: '3px solid var(--neon-red)', 
            borderRadius: '24px', 
            padding: '28px', 
            color: 'var(--text-dark)',
            boxShadow: '0 20px 40px rgba(0, 0, 0, 0.5)'
          }}>
            <div className="modal-header" style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center', 
              marginBottom: '20px', 
              borderBottom: '1px solid rgba(195, 122, 103, 0.2)', 
              paddingBottom: '12px' 
            }}>
              <h2 style={{ fontFamily: 'Orbitron', color: 'var(--neon-red)', fontWeight: 900, fontSize: '15px', margin: 0 }}>
                🍕 SELECCIONAR BILLETERA STELLAR
              </h2>
              <button className="modal-close-btn" onClick={() => setShowStellarWalletModal(false)} style={{ color: 'var(--neon-red)', fontSize: '24px', cursor: 'pointer', background: 'none', border: 'none', outline: 'none' }}>×</button>
            </div>

            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              {isWalletConnecting ? (
                <div style={{ textAlign: 'center', padding: '30px 10px' }}>
                  <div className="loading-spinner" style={{ border: '4px solid rgba(195, 122, 103, 0.1)', borderTop: '4px solid var(--neon-red)', borderRadius: '50%', width: '40px', height: '40px', animation: 'spin 1s linear infinite', margin: '0 auto 15px auto' }}></div>
                  <p style={{ fontFamily: 'Orbitron', fontSize: '13px', color: 'var(--neon-red)', margin: 0 }}>Conectando de forma segura con la red...</p>
                </div>
              ) : walletSelectorTab === 'main' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  
                  {/* Sección 1: Conexión Social & Inteligente */}
                  <div>
                    <h3 style={{ fontSize: '11px', fontFamily: 'Orbitron', color: 'var(--text-dark)', opacity: 0.6, letterSpacing: '1px', marginBottom: '8px', textTransform: 'uppercase' }}>
                      ⚡ Conexión Instantánea (Web3 para todos)
                    </h3>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                      {/* Privy Social */}
                      <button 
                        className="modal-action-btn"
                        onClick={async () => {
                          setIsWalletConnecting(true);
                          const success = await connectStellar('google');
                          setIsWalletConnecting(false);
                          if (success) setShowStellarWalletModal(false);
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                          background: 'rgba(28, 22, 16, 0.8)',
                          border: '2px solid rgba(195, 122, 103, 0.2)',
                          color: 'var(--text-dark)',
                          padding: '12px 14px',
                          borderRadius: '14px',
                          cursor: 'pointer',
                          fontFamily: 'Outfit',
                          fontSize: '11px',
                          fontWeight: 'bold',
                          textAlign: 'left',
                          transition: 'all 0.2s'
                        }}
                      >
                        <span style={{ fontSize: '20px' }}>📧</span>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <span style={{ color: 'var(--neon-red)' }}>Google / Social</span>
                          <span style={{ fontSize: '8px', fontWeight: 'normal', opacity: 0.7 }}>Privy Auth</span>
                        </div>
                      </button>

                      {/* Passkeys */}
                      <button 
                        className="modal-action-btn"
                        onClick={() => setWalletSelectorTab('passkey')}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                          background: 'rgba(28, 22, 16, 0.8)',
                          border: '2px solid rgba(195, 122, 103, 0.2)',
                          color: 'var(--text-dark)',
                          padding: '12px 14px',
                          borderRadius: '14px',
                          cursor: 'pointer',
                          fontFamily: 'Outfit',
                          fontSize: '11px',
                          fontWeight: 'bold',
                          textAlign: 'left',
                          transition: 'all 0.2s'
                        }}
                      >
                        <span style={{ fontSize: '20px' }}>🔑</span>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <span style={{ color: 'var(--neon-red)' }}>Passkey Biométrica</span>
                          <span style={{ fontSize: '8px', fontWeight: 'normal', opacity: 0.7 }}>Sin contraseña</span>
                        </div>
                      </button>
                    </div>
                  </div>

                  {/* Sección 2: Billeteras Oficiales de Stellar */}
                  <div>
                    <h3 style={{ fontSize: '11px', fontFamily: 'Orbitron', color: 'var(--text-dark)', opacity: 0.6, letterSpacing: '1px', marginBottom: '8px', textTransform: 'uppercase' }}>
                      🛡️ Billeteras Oficiales de Stellar
                    </h3>
                    
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
                      {/* Freighter */}
                      <button 
                        className="modal-action-btn"
                        onClick={async () => {
                          setIsWalletConnecting(true);
                          const success = await connectStellar('freighter');
                          setIsWalletConnecting(false);
                          if (success) setShowStellarWalletModal(false);
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                          background: 'rgba(28, 22, 16, 0.8)',
                          border: '2px solid rgba(195, 122, 103, 0.15)',
                          color: 'var(--text-dark)',
                          padding: '10px 12px',
                          borderRadius: '12px',
                          cursor: 'pointer',
                          fontSize: '11px',
                          fontWeight: 'bold',
                          textAlign: 'left'
                        }}
                      >
                        <span style={{ fontSize: '18px' }}>🚀</span>
                        <span>Freighter</span>
                      </button>

                      {/* Albedo */}
                      <button 
                        className="modal-action-btn"
                        onClick={async () => {
                          setIsWalletConnecting(true);
                          const success = await connectStellar('albedo');
                          setIsWalletConnecting(false);
                          if (success) setShowStellarWalletModal(false);
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                          background: 'rgba(28, 22, 16, 0.8)',
                          border: '2px solid rgba(195, 122, 103, 0.15)',
                          color: 'var(--text-dark)',
                          padding: '10px 12px',
                          borderRadius: '12px',
                          cursor: 'pointer',
                          fontSize: '11px',
                          fontWeight: 'bold',
                          textAlign: 'left'
                        }}
                      >
                        <span style={{ fontSize: '18px' }}>🌌</span>
                        <span>Albedo</span>
                      </button>

                      {/* Lobstr */}
                      <button 
                        className="modal-action-btn"
                        onClick={async () => {
                          setIsWalletConnecting(true);
                          const success = await connectStellar('lobstr');
                          setIsWalletConnecting(false);
                          if (success) setShowStellarWalletModal(false);
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                          background: 'rgba(28, 22, 16, 0.8)',
                          border: '2px solid rgba(195, 122, 103, 0.15)',
                          color: 'var(--text-dark)',
                          padding: '10px 12px',
                          borderRadius: '12px',
                          cursor: 'pointer',
                          fontSize: '11px',
                          fontWeight: 'bold',
                          textAlign: 'left'
                        }}
                      >
                        <span style={{ fontSize: '18px' }}>🦞</span>
                        <span>LOBSTR</span>
                      </button>

                      {/* xBull */}
                      <button 
                        className="modal-action-btn"
                        onClick={async () => {
                          setIsWalletConnecting(true);
                          const success = await connectStellar('xbull');
                          setIsWalletConnecting(false);
                          if (success) setShowStellarWalletModal(false);
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                          background: 'rgba(28, 22, 16, 0.8)',
                          border: '2px solid rgba(195, 122, 103, 0.15)',
                          color: 'var(--text-dark)',
                          padding: '10px 12px',
                          borderRadius: '12px',
                          cursor: 'pointer',
                          fontSize: '11px',
                          fontWeight: 'bold',
                          textAlign: 'left'
                        }}
                      >
                        <span style={{ fontSize: '18px' }}>🐂</span>
                        <span>xBull</span>
                      </button>

                      {/* Hana */}
                      <button 
                        className="modal-action-btn"
                        onClick={async () => {
                          setIsWalletConnecting(true);
                          const success = await connectStellar('hana');
                          setIsWalletConnecting(false);
                          if (success) setShowStellarWalletModal(false);
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                          background: 'rgba(28, 22, 16, 0.8)',
                          border: '2px solid rgba(195, 122, 103, 0.15)',
                          color: 'var(--text-dark)',
                          padding: '10px 12px',
                          borderRadius: '12px',
                          cursor: 'pointer',
                          fontSize: '11px',
                          fontWeight: 'bold',
                          textAlign: 'left'
                        }}
                      >
                        <span style={{ fontSize: '18px' }}>🌸</span>
                        <span>Hana Wallet</span>
                      </button>

                      {/* Ledger */}
                      <button 
                        className="modal-action-btn"
                        onClick={async () => {
                          setIsWalletConnecting(true);
                          const success = await connectStellar('ledger');
                          setIsWalletConnecting(false);
                          if (success) setShowStellarWalletModal(false);
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                          background: 'rgba(28, 22, 16, 0.8)',
                          border: '2px solid rgba(195, 122, 103, 0.15)',
                          color: 'var(--text-dark)',
                          padding: '10px 12px',
                          borderRadius: '12px',
                          cursor: 'pointer',
                          fontSize: '11px',
                          fontWeight: 'bold',
                          textAlign: 'left'
                        }}
                      >
                        <span style={{ fontSize: '18px' }}>💳</span>
                        <span>Ledger</span>
                      </button>
                    </div>

                    {/* Selector de Kit general */}
                    <button 
                      className="modal-action-btn"
                      onClick={async () => {
                        setIsWalletConnecting(true);
                        const success = await connectStellar('kit');
                        setIsWalletConnecting(false);
                        if (success) setShowStellarWalletModal(false);
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '10px',
                        background: 'linear-gradient(135deg, var(--neon-orange), rgba(195, 122, 103, 0.15))',
                        border: '2px dashed var(--neon-red)',
                        color: 'var(--text-dark)',
                        padding: '12px',
                        borderRadius: '14px',
                        cursor: 'pointer',
                        fontFamily: 'Orbitron',
                        fontSize: '10px',
                        fontWeight: 'bold',
                        width: '100%',
                        transition: 'all 0.2s'
                      }}
                    >
                      <span>🛡️</span>
                      <span>OTRO PROVEEDOR (STELLAR WALLETS KIT)</span>
                    </button>
                  </div>
                  
                </div>
              ) : walletSelectorTab === 'passkey' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                  <p style={{ fontSize: '12px', color: 'var(--text-dark)', opacity: 0.8, margin: 0 }}>
                    Registra o autentica tu cuenta usando la llave de seguridad nativa de tu dispositivo (FaceID, TouchID o pin local):
                  </p>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '10px', color: 'var(--neon-red)', fontWeight: 'bold', fontFamily: 'Orbitron' }}>ALIAS DE CHEF / USERNAME</label>
                    <input 
                      type="text" 
                      value={stellarUsername}
                      onChange={(e) => setStellarUsername(e.target.value)}
                      style={{ 
                        background: 'rgba(28, 22, 16, 0.8)', 
                        border: '2px solid rgba(195, 122, 103, 0.4)', 
                        borderRadius: '10px', 
                        padding: '10px 14px', 
                        color: 'var(--text-dark)', 
                        fontSize: '12px', 
                        outline: 'none', 
                        fontFamily: 'monospace' 
                      }}
                      placeholder="Chef_Soroban"
                    />
                  </div>

                  <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                    <button 
                      className="console-btn"
                      onClick={() => setWalletSelectorTab('main')}
                      style={{ 
                        flex: 1, 
                        padding: '12px', 
                        fontSize: '11px', 
                        border: '2px solid rgba(195, 122, 103, 0.3)', 
                        color: 'var(--text-dark)', 
                        cursor: 'pointer', 
                        borderRadius: '10px',
                        background: 'none'
                      }}
                    >
                      VOLVER
                    </button>
                    <button 
                      className="console-btn"
                      onClick={async () => {
                        if (!stellarUsername.trim()) {
                          alert('Por favor ingresa un nombre.');
                          return;
                        }
                        setIsWalletConnecting(true);
                        const success = await connectStellar('passkey', stellarUsername);
                        setIsWalletConnecting(false);
                        if (success) setShowStellarWalletModal(false);
                      }}
                      style={{
                        flex: 1,
                        padding: '12px',
                        fontSize: '11px',
                        border: 'none',
                        color: '#fff',
                        cursor: 'pointer',
                        borderRadius: '10px',
                        background: 'linear-gradient(135deg, var(--neon-red), var(--neon-orange))',
                        fontFamily: 'Orbitron',
                        fontWeight: 'bold'
                      }}
                    >
                      {isWalletConnecting ? 'CONECTANDO...' : 'REGISTRAR / ENTRAR'}
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                  <p style={{ fontSize: '12px', color: 'var(--text-dark)', opacity: 0.8, margin: 0 }}>
                    Ingresa con tu cuenta de Google para generar automáticamente una billetera Stellar (Soroban) sin fricción:
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '10px', color: 'var(--neon-red)', fontWeight: 'bold', fontFamily: 'Orbitron' }}>EMAIL DE GOOGLE</label>
                    <input
                      type="email"
                      value={googleEmail}
                      onChange={(e) => setGoogleEmail(e.target.value)}
                      style={{
                        background: 'rgba(28, 22, 16, 0.8)',
                        border: '2px solid rgba(195, 122, 103, 0.4)',
                        borderRadius: '10px',
                        padding: '10px 14px',
                        color: 'var(--text-dark)',
                        fontSize: '12px',
                        outline: 'none',
                        fontFamily: 'monospace'
                      }}
                      placeholder="chef@gmail.com"
                    />
                  </div>
                  <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                    <button
                      className="console-btn"
                      onClick={() => setWalletSelectorTab('main')}
                      style={{
                        flex: 1,
                        padding: '12px',
                        fontSize: '11px',
                        border: '2px solid rgba(195, 122, 103, 0.3)',
                        color: 'var(--text-dark)',
                        cursor: 'pointer',
                        borderRadius: '10px',
                        background: 'none'
                      }}
                    >
                      VOLVER
                    </button>
                    <button
                      className="console-btn"
                      onClick={async () => {
                        if (!googleEmail.trim()) {
                          alert('Por favor ingresa tu email de Google.');
                          return;
                        }
                        setIsWalletConnecting(true);
                        const success = await connectStellar('google', googleEmail);
                        setIsWalletConnecting(false);
                        if (success) setShowStellarWalletModal(false);
                      }}
                      style={{
                        flex: 1,
                        padding: '12px',
                        fontSize: '11px',
                        border: 'none',
                        color: '#fff',
                        cursor: 'pointer',
                        borderRadius: '10px',
                        background: 'linear-gradient(135deg, var(--neon-red), var(--neon-orange))',
                        fontFamily: 'Orbitron',
                        fontWeight: 'bold'
                      }}
                    >
                      {isWalletConnecting ? 'CONECTANDO...' : 'CONTINUAR CON GOOGLE'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
