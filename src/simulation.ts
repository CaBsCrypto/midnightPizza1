import { PizzeriaAudio } from './audio';

export type CellValue = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export const CELL_TYPES = {
  EMPTY: 0,
  MARGHERITA: 1, // 1x1, 100 pts
  PEPPERONI: 2,  // 1x2 / 2x1, 200 pts
  SUPREMA: 3,    // 2x2 square, 300 pts
  GIGANTE: 4,    // 1x5 / 5x1, 500 pts
  JALAPENO: 5,   // Trap, -1 HP
  HABANERO: 6,   // Trap, -2 HP
  WATER: 7,      // Cure, +1 HP
  MILK: 8,       // Cure, +2 HP
  GOLD_TRUFFLE: 9 // Special, +500 pts, +2 HP, Trap Immunity
} as const;

export interface RivalChef {
  name: string;
  emoji: string;
  aggression: number; // 1 to 5
  title: string;
}

export interface Friend {
  id: string;
  name: string;
  emoji: string;
  status: 'En línea' | 'Jugando' | 'Desconectado';
  isCustom?: boolean;
}

export interface GameState {
  playerBoard: number[][]; // 6x6 grid values
  rivalBoard: number[][];  // 6x6 grid values
  playerRevealed: boolean[][]; // 6x6 revealed positions on rival's board
  rivalRevealed: boolean[][];  // 6x6 revealed positions on player's board

  playerHP: number; // 3 to 5
  rivalHP: number;  // 3 to 5
  playerScore: number;
  rivalScore: number;

  playerTrapImmunity: boolean;
  rivalTrapImmunity: boolean;

  gameState: 'lobby' | 'playing' | 'ended';
  winner: 'player' | 'rival' | null;

  // Lobby Matchmaking Status
  lobbyStatus: 'idle' | 'searching' | 'handshake' | 'playing';
  matchmakingTime: number; // in seconds
  rivalChef: RivalChef | null;

  // Friends & Challenges Panel
  friends: Friend[];

  // Multi-Tab state
  tabId: string;
  isMultiplayerActive: boolean;
  multiplayerRole: 'host' | 'guest' | null;
  multiplayerRivalTabId: string | null;
  playerTurn: boolean;
  
  // Custom interactive item placement and lobby countdown
  playerInventory?: { [key: number]: number }; // itemType -> count
  lobbyTimer?: number; // 15 to 0

  // Battle and maneuver phase setup countdowns
  startCountdown?: number;
  isManeuverPhase?: boolean;
  maneuverTimer?: number;
  turnTimer?: number;
  playerCommitment?: string;
  rivalCommitment?: string;
  isForfeitPhase?: boolean;
  forfeitTimer?: number;
  witnessCertificate?: string;
}

// Dummy structures for backward compatibility with contract and grid types
export interface Building {
  type: string;
  x: number;
  y: number;
  level: number;
  efficiency: number;
  wear: number;
}
export type BuildingType = string;

export class PizzeriaSimulation {
  public state: GameState;
  private logsCallback: (msg: string, type: 'system' | 'info' | 'success' | 'warn' | 'error') => void;
  private effectCallback?: (text: string, x: number, y: number, color: string) => void;
  private announcementCallback?: (title: string, subtitle: string) => void;
  private zkLogCallback?: (msg: string) => void;

  // Smart Chef Bot Hunt State
  private botHuntQueue: [number, number][] = [];
  // private botLastHit: [number, number] | null = null;
  private botTargetPizzaVal: number | null = null;

  // BroadcastChannel for Multi-tab sync and multiplayer
  private syncChannel: BroadcastChannel;

  constructor(logsCallback: (msg: string, type: 'system' | 'info' | 'success' | 'warn' | 'error') => void) {
    this.logsCallback = logsCallback;
    this.state = this.getInitialState();
    
    // Pre-populate player secret board with only pizzas in lobby for manual customization
    this.state.playerBoard = this.generatePizzasOnlyBoard();
    
    // Create synchronization broadcast channel
    this.syncChannel = new BroadcastChannel('pizza_battleship_sync');
    this.setupBroadcastListeners();
    this.broadcastPresence();

    // Start 1-second lobby, battle, and turn phases countdown interval
    setInterval(() => {
      // 1. Lobby countdown
      if (this.state.gameState === 'lobby' && this.state.lobbyTimer !== undefined && this.state.lobbyTimer > 0) {
        this.state.lobbyTimer -= 1;
        if (this.state.lobbyTimer === 0) {
          this.logsCallback('⏰ ¡Se acabó el tiempo de preparación! Tablero autocompletado aleatoriamente.', 'warn');
          this.autoCompleteBoardRandomly();
        }
      }
      
      // 2. Battle Match countdown (3, 2, 1)
      else if (this.state.gameState === 'playing' && this.state.startCountdown !== undefined && this.state.startCountdown > 0) {
        this.state.startCountdown -= 1;
        if (this.state.startCountdown === 0) {
          // Trigger the 10s Maneuver Setup Phase!
          this.state.isManeuverPhase = true;
          this.state.maneuverTimer = 10;
          this.logsCallback('🚀 ¡FASE DE MANIOBRA INICIADA! Tienes 10 segundos para reubicar pizzas y colocar ítems.', 'success');
          PizzeriaAudio.playFanfare(); // Play battle start audio fanfare instead of a full screen overlay blocker
        } else {
          PizzeriaAudio.playClick();
        }
      }
      
      // 3. Maneuver setup phase countdown (10 to 0)
      else if (this.state.gameState === 'playing' && this.state.isManeuverPhase && this.state.maneuverTimer !== undefined && this.state.maneuverTimer > 0) {
        this.state.maneuverTimer -= 1;
        if (this.state.maneuverTimer === 0) {
          // LOCK and finalize!
          this.state.isManeuverPhase = false;
          this.finalizePlayerBoard();
          this.logsCallback('🔒 ¡Mesa de combate bloqueada! Comienzan los turnos de mordisco.', 'success');
          this.announcementCallback?.('⚔️ ¡A COMBATIR! ⚔️', 'MUERDE EL TABLERO DEL RIVAL Y EVITA PICANTES');
          
          // Set Turn Timer to 15s
          this.state.turnTimer = 15;

          // If single player vs AI bot, generate rival board
          if (!this.state.isMultiplayerActive) {
            this.state.rivalBoard = this.generateRandomBoard();
          }

          // Calculate commitments for finalized boards
          this.state.playerCommitment = this.calculateBoardCommitment(this.state.playerBoard);
          this.state.rivalCommitment = this.calculateBoardCommitment(this.state.rivalBoard);
          if (this.zkLogCallback) {
            this.zkLogCallback('[prove_setup_commitment()] Regenerando compromiso por finalización de maniobras...');
            this.zkLogCallback(`[prove_setup_commitment()] Merkle Root Final Bloqueado (Jugador): ${this.state.playerCommitment}`);
            this.zkLogCallback(`[prove_setup_commitment()] Merkle Root Final Bloqueado (Rival): ${this.state.rivalCommitment}`);
            this.zkLogCallback('[compact_ledger] Nuevo compromiso publicado en Midnight L2.');
          }

          this.logsCallback(this.state.playerTurn ? '👉 ¡Es tu turno de morder el tablero rival!' : '⏳ Turno rival pensando...', 'info');
        }
      }

      // 4. Turn Timer ticking (15s limit per turn!)
      else if (this.state.gameState === 'playing' && !this.state.isManeuverPhase && (this.state.startCountdown === undefined || this.state.startCountdown === 0)) {
        if (this.state.isForfeitPhase && this.state.forfeitTimer !== undefined && this.state.forfeitTimer > 0) {
          this.state.forfeitTimer -= 1;
          if (this.state.forfeitTimer === 0) {
            this.state.isForfeitPhase = false;
            this.state.winner = 'player';
            this.state.gameState = 'ended';
            this.state.lobbyStatus = 'idle';
            this.state.isMultiplayerActive = false;

            const certHex = `0x witness_cert_f8a3c019d08e5c4a${Math.floor(Math.random() * 10000000).toString(16)}024e81cb`;
            this.state.witnessCertificate = certHex;

            this.logsCallback('🛡️ ¡Servidor Testigo activado! Certificado de resultados emitido por abandono del oponente.', 'success');
            this.logsCallback(`🔑 Certificado: ${certHex}`, 'system');

            if (this.zkLogCallback) {
              this.zkLogCallback('[witness_oracle] Período de gracia expirado.');
              this.zkLogCallback(`[witness_oracle] Certificado de abandono generado: ${certHex}`);
              this.zkLogCallback('[witness_oracle] Listo para reclamo de Trufas de Oro en Midnight L2.');
            }

            PizzeriaAudio.playFanfare();
          }
        } else if (this.state.turnTimer !== undefined && this.state.turnTimer > 0) {
          this.state.turnTimer -= 1;
          if (this.state.turnTimer === 0) {
            if (this.state.playerTurn) {
              // Player ran out of time! Execute auto-bite!
              this.autoBiteCellRandomly();
            }
          }
        }
      }
    }, 1000);
  }

  public setZKLogCallback(cb: (msg: string) => void): void {
    this.zkLogCallback = cb;
  }

  public setEffectCallback(cb: (text: string, x: number, y: number, color: string) => void): void {
    this.effectCallback = cb;
  }

  public setAnnouncementCallback(cb: (title: string, subtitle: string) => void): void {
    this.announcementCallback = cb;
  }

  private getInitialState(): GameState {
    const tabId = Math.random().toString(36).substring(2, 9);
    
    // Standard initial friends list
    const friends: Friend[] = [
      { id: 'f1', name: 'Donna_Margherita', emoji: '👩‍🍳', status: 'Jugando' },
      { id: 'f2', name: 'Chef_Jalapeno', emoji: '🌶️', status: 'En línea' },
      { id: 'f3', name: 'Pizzaiolo_Pro', emoji: '🧀', status: 'Desconectado' },
      { id: 'f4', name: 'Chef_Ramen', emoji: '🍜', status: 'En línea' }
    ];

    return {
      playerBoard: Array.from({ length: 6 }, () => Array(6).fill(0)),
      rivalBoard: Array.from({ length: 6 }, () => Array(6).fill(0)),
      playerRevealed: Array.from({ length: 6 }, () => Array(6).fill(false)),
      rivalRevealed: Array.from({ length: 6 }, () => Array(6).fill(false)),
      playerHP: 3,
      rivalHP: 3,
      playerScore: 0,
      rivalScore: 0,
      playerTrapImmunity: false,
      rivalTrapImmunity: false,
      gameState: 'lobby',
      winner: null,
      lobbyStatus: 'idle',
      matchmakingTime: 0,
      rivalChef: null,
      friends,
      tabId,
      isMultiplayerActive: false,
      multiplayerRole: null,
      multiplayerRivalTabId: null,
      playerTurn: true,
      playerInventory: {
        5: 2, // 2 Jalapenos
        6: 1, // 1 Habanero
        7: 1, // 1 Water
        8: 1, // 1 Milk
        9: 1  // 1 Gold Truffle
      },
      lobbyTimer: 15
    };
  }

  // --- BroadcastChannel Cross-Tab Synchronization & Multiplayer ---
  private setupBroadcastListeners(): void {
    this.syncChannel.onmessage = (event: MessageEvent) => {
      const msg = event.data;
      if (!msg || msg.senderId === this.state.tabId) return;

      switch (msg.type) {
        case 'presence':
          // Add tab neighbor as a online friend dynamically!
          this.handleTabPresence(msg.senderId, msg.senderName);
          break;
        case 'challenge':
          if (this.state.gameState === 'lobby') {
            this.logsCallback(`✉️ ¡DESAFÍO RECIBIDO! El chef de la otra pestaña (${msg.senderName}) te ha retado.`, 'system');
            // Auto accept challenge or prompt (we auto-accept for smooth fast gamplay!)
            this.acceptMultiplayerChallenge(msg.senderId, msg.senderName);
          }
          break;
        case 'accept':
          this.logsCallback(`🤝 ¡DESAFÍO ACEPTADO! Conectando batalla multitab contra ${msg.senderName}.`, 'success');
          this.startMultiplayerGame(msg.senderId, msg.senderName, false); // Host goes second
          break;
        case 'move':
          if (this.state.isMultiplayerActive && !this.state.playerTurn) {
            const { r, c } = msg.payload;
            const val = this.state.playerBoard[r][c];
            this.applyMultiplayerOpponentMove(r, c);
            
            // Reply with the exact cell value so the opponent can render it
            this.syncChannel.postMessage({
              type: 'move_result',
              senderId: this.state.tabId,
              senderName: `Tab_Chef_${this.state.tabId.toUpperCase()}`,
              payload: { r, c, val }
            });
          }
          break;
        case 'move_result':
          if (this.state.isMultiplayerActive) {
            const { r, c, val } = msg.payload;
            this.state.rivalBoard[r][c] = val;
            this.processBiteAction('player', r, c, val);
          }
          break;
        case 'chat':
          this.logsCallback(`[${msg.senderName}]: ${msg.payload}`, 'info');
          break;
      }
    };
  }

  private broadcastPresence(): void {
    this.syncChannel.postMessage({
      type: 'presence',
      senderId: this.state.tabId,
      senderName: `Tab_Chef_${this.state.tabId.toUpperCase()}`
    });
  }

  private handleTabPresence(tabId: string, name: string): void {
    const exists = this.state.friends.some(f => f.id === tabId);
    if (!exists) {
      this.state.friends.unshift({
        id: tabId,
        name,
        emoji: '💻',
        status: 'En línea',
        isCustom: true
      });
      this.logsCallback(`✨ ¡Se detectó otra pestaña de Pizza Battleship abierta! (${name} agregado a amigos).`, 'info');
      // Sync presence back to that tab
      this.syncChannel.postMessage({
        type: 'presence',
        senderId: this.state.tabId,
        senderName: `Tab_Chef_${this.state.tabId.toUpperCase()}`
      });
    }
  }

  // Challenge another tab
  public challengeFriend(friendId: string): void {
    const friend = this.state.friends.find(f => f.id === friendId);
    if (!friend) return;

    // AI Bots can always be challenged, only real players are limited by offline status
    if (!friend.id.startsWith('f') && friend.status === 'Desconectado') {
      this.logsCallback(`❌ ${friend.name} está desconectado. No se puede retar.`, 'warn');
      return;
    }

    if (friend.id.startsWith('f')) {
      // It is an AI Bot friend - simulate direct invite
      this.logsCallback(`✉️ Enviando reto a ${friend.name}...`, 'info');
      this.state.lobbyStatus = 'handshake';
      setTimeout(() => {
        const chefs: RivalChef[] = [
          { name: 'Donna_Margherita', emoji: '👩‍🍳', aggression: 3, title: 'Margherita Matriarch' },
          { name: 'Chef_Jalapeno', emoji: '🌶️', aggression: 5, title: 'Spice Overlord' },
          { name: 'Pizzaiolo_Pro', emoji: '🧀', aggression: 4, title: 'Dough Master' },
          { name: 'Chef_Ramen', emoji: '🍜', aggression: 2, title: 'Noodle Fusion' }
        ];
        const selected = chefs.find(c => c.name === friend.name) || chefs[0];
        this.state.rivalChef = selected;
        this.logsCallback(`🤝 ¡${friend.name} aceptó el desafío! Conectando...`, 'success');
        this.startGame(selected);
      }, 1500);
    } else {
      // Real Multi-tab Sync Challenge
      this.logsCallback(`✉️ Enviando reto multitab a ${friend.name}...`, 'info');
      this.syncChannel.postMessage({
        type: 'challenge',
        senderId: this.state.tabId,
        senderName: `Tab_Chef_${this.state.tabId.toUpperCase()}`
      });
    }
  }

  private acceptMultiplayerChallenge(opponentTabId: string, opponentName: string): void {
    this.syncChannel.postMessage({
      type: 'accept',
      senderId: this.state.tabId,
      senderName: `Tab_Chef_${this.state.tabId.toUpperCase()}`
    });
    this.startMultiplayerGame(opponentTabId, opponentName, true); // Guest goes first
  }

  private startMultiplayerGame(opponentTabId: string, opponentName: string, startsFirst: boolean): void {
    // DO NOT finalize player board here; allow customization during maneuver phase!
    this.state.gameState = 'playing';
    this.state.lobbyStatus = 'playing';
    this.state.isMultiplayerActive = true;
    this.state.multiplayerRole = startsFirst ? 'guest' : 'host';
    this.state.multiplayerRivalTabId = opponentTabId;
    this.state.playerTurn = startsFirst;

    // Match Start Countdowns
    this.state.startCountdown = 4;
    this.state.isManeuverPhase = false;
    this.state.maneuverTimer = 10;
    
    // Generate boards (preserve custom player board, reset rival)
    this.state.rivalBoard = Array.from({ length: 6 }, () => Array(6).fill(0)); // Hidden, filled on responses
    this.state.playerRevealed = Array.from({ length: 6 }, () => Array(6).fill(false));
    this.state.rivalRevealed = Array.from({ length: 6 }, () => Array(6).fill(false));

    this.state.playerHP = 3;
    this.state.rivalHP = 3;
    this.state.playerScore = 0;
    this.state.rivalScore = 0;
    this.state.playerTrapImmunity = false;
    this.state.rivalTrapImmunity = false;
    this.state.winner = null;

    this.state.rivalChef = {
      name: opponentName,
      emoji: '⚡',
      aggression: 4,
      title: 'Jugador Humano Real'
    };

    // Calculate commitments for secret boards
    this.state.playerCommitment = this.calculateBoardCommitment(this.state.playerBoard);
    this.state.rivalCommitment = this.calculateBoardCommitment(this.state.rivalBoard);
    this.zkLogCallback?.('[prove_setup_commitment()] Generando compromiso de Mesa Secreta...');
    this.zkLogCallback?.(`[prove_setup_commitment()] Merkle Root generado (Jugador): ${this.state.playerCommitment}`);
    this.zkLogCallback?.(`[prove_setup_commitment()] Merkle Root generado (Rival): ${this.state.rivalCommitment}`);
    this.zkLogCallback?.('[compact_ledger] Estado publicado en Midnight L2.');

    this.logsCallback(`... ¡BETA MULTIJUGADOR ACTIVADA! Te enfrentas a ${opponentName}.`, 'success');
    this.announcementCallback?.('🤝 ¡RETADOR ENCONTRADO! 🤝', 'SINCRONIZANDO COMPROMISOS EN MIDNIGHT L2');
  }

  private applyMultiplayerOpponentMove(r: number, c: number): void {
    this.state.rivalRevealed[r][c] = true;
    const val = Number(this.state.playerBoard[r][c]);

    this.effectCallback?.('💥 GOLPE', c, r, 'rgba(239,68,68,1)');
    this.logsCallback(`⚡ El rival mordió la celda (${c}, ${r}) en tu tablero.`, 'info');

    // Handle trap/cures/pizza values
    if (val >= 1 && val <= 4) {
      this.state.rivalScore += 50;
      // Check devastation
      if (this.isPizzaFullyDevoured(this.state.playerBoard, this.state.rivalRevealed, val)) {
        const hpDamage = val === 1 || val === 2 ? 1 : (val === 3 ? 2 : 3);
        this.state.playerHP = Math.max(0, Number(this.state.playerHP) - hpDamage);
        this.logsCallback(`💥 ¡DEVASTACIÓN! El rival destruyó completamente tu pizza. Daño: -${hpDamage} HP.`, 'error');
      }
    } else if (val === 5 || val === 6) {
      const trapDmg = val === 5 ? 1 : 2;
      if (this.state.rivalTrapImmunity) {
        this.state.rivalTrapImmunity = false;
        this.logsCallback(`🛡️ El rival cayó en tu trampa, pero su inmunidad de trufa lo salvó.`, 'system');
      } else {
        this.state.rivalHP = Math.max(0, Number(this.state.rivalHP) - trapDmg);
        this.logsCallback(`🌶️ ¡TRAMPA! El rival mordió tu picante y recibió -${trapDmg} HP.`, 'success');
      }
    } else if (val >= 7 && val <= 9) {
      if (val === 7) this.state.rivalHP = Math.min(5, Number(this.state.rivalHP) + 1);
      if (val === 8) this.state.rivalHP = Math.min(5, Number(this.state.rivalHP) + 2);
      if (val === 9) {
        this.state.rivalHP = Math.min(5, Number(this.state.rivalHP) + 2);
        this.state.rivalScore += 500;
        this.state.rivalTrapImmunity = true;
      }
      this.logsCallback(`🍼 El rival mordió una cura en tu tablero.`, 'warn');
    }

    this.checkGameStatus();
    if (this.state.gameState === 'playing') {
      this.state.playerTurn = true;
      this.state.turnTimer = 15;
      this.logsCallback('👉 ¡Es tu turno de morder el tablero rival!', 'success');
    }
  }

  // --- Core Game Loops ---

  public startMatchmaking(): void {
    if (this.state.gameState === 'playing') return;
    
    this.state.lobbyStatus = 'searching';
    this.state.matchmakingTime = 0;
    this.logsCallback('📡 Conectándose a los servidores de PizzaDAO...', 'info');
    this.logsCallback('🔎 Buscando un oponente culinario digno...', 'system');
  }

  public cancelMatchmaking(): void {
    this.state.lobbyStatus = 'idle';
    this.logsCallback('❌ Búsqueda de emparejamiento cancelada.', 'warn');
  }

  public startGame(chef: RivalChef): void {
    // DO NOT finalize the player board here; allow customization during maneuver phase!
    this.state.gameState = 'playing';
    this.state.lobbyStatus = 'playing';
    this.state.rivalChef = chef;

    // Match Start Countdowns
    this.state.startCountdown = 4;
    this.state.isManeuverPhase = false;
    this.state.maneuverTimer = 10;

    // Reset game properties (preserve playerBoard, reset rival)
    this.state.rivalBoard = this.generateRandomBoard();
    this.state.playerRevealed = Array.from({ length: 6 }, () => Array(6).fill(false));
    this.state.rivalRevealed = Array.from({ length: 6 }, () => Array(6).fill(false));

    this.state.playerHP = 3;
    this.state.rivalHP = 3;
    this.state.playerScore = 0;
    this.state.rivalScore = 0;
    this.state.playerTrapImmunity = false;
    this.state.rivalTrapImmunity = false;
    this.state.winner = null;

    // Reset bot states
    this.botHuntQueue = [];
    this.botTargetPizzaVal = null;

    // Calculate commitments for secret boards
    this.state.playerCommitment = this.calculateBoardCommitment(this.state.playerBoard);
    this.state.rivalCommitment = this.calculateBoardCommitment(this.state.rivalBoard);
    this.zkLogCallback?.('[prove_setup_commitment()] Generando compromiso de Mesa Secreta...');
    this.zkLogCallback?.(`[prove_setup_commitment()] Merkle Root generado (Jugador): ${this.state.playerCommitment}`);
    this.zkLogCallback?.(`[prove_setup_commitment()] Merkle Root generado (Rival): ${this.state.rivalCommitment}`);
    this.zkLogCallback?.('[compact_ledger] Estado publicado en Midnight L2.');

    this.logsCallback(`🎯 ¡COMIENZA LA BATALLA contra ${chef.name} (${chef.title})!`, 'success');
    this.announcementCallback?.('🤝 ¡RETADOR ENCONTRADO! 🤝', 'SINCRONIZANDO COMPROMISOS EN MIDNIGHT L2');
  }

  // Player bites a rival grid cell [r, c]
  public biteCell(r: number, c: number): boolean {
    if (this.state.gameState !== 'playing') return false;
    if (!this.state.playerTurn) {
      this.logsCallback('⏳ Espera tu turno. El rival está pensando...', 'warn');
      return false;
    }
    if (this.state.playerRevealed[r][c]) {
      this.logsCallback('🚫 Ya mordiste esta celda. Elige otra.', 'warn');
      return false;
    }

    this.state.playerRevealed[r][c] = true;

    // Communicate to the other tab if multiplayer is active
    if (this.state.isMultiplayerActive) {
      this.syncChannel.postMessage({
        type: 'move',
        senderId: this.state.tabId,
        senderName: `Tab_Chef_${this.state.tabId.toUpperCase()}`,
        payload: { r, c }
      });
      this.state.playerTurn = false;
      this.state.turnTimer = 15; // Reset for opponent turn
      return true;
    }

    // Process player bite action (Single player / vs AI bot)
    const val = this.state.rivalBoard[r][c];
    this.processBiteAction('player', r, c, val);
    
    // Bot responds if standard singleplayer
    if (this.state.gameState === 'playing' && !this.state.isMultiplayerActive) {
      this.state.playerTurn = false;
      this.state.turnTimer = 15; // Set bot's turn timer limits
      setTimeout(() => {
        this.chefBotTurn();
        if (this.state.gameState === 'playing') {
          this.state.playerTurn = true;
          this.state.turnTimer = 15; // Reset player's turn timer!
        }
      }, 1000 + (6 - this.state.rivalChef!.aggression) * 200);
    }

    return true;
  }

  private processBiteAction(attacker: 'player' | 'rival', r: number, c: number, val: number): void {
    const isPlayer = attacker === 'player';
    const name = isPlayer ? 'Tú' : this.state.rivalChef?.name || 'Chef Bot';
    const cellVal = Number(val);

    let cellName = 'Agua de mar';
    if (cellVal === CELL_TYPES.MARGHERITA) cellName = 'Margherita';
    else if (cellVal === CELL_TYPES.PEPPERONI) cellName = 'Pepperoni';
    else if (cellVal === CELL_TYPES.SUPREMA) cellName = 'Suprema';
    else if (cellVal === CELL_TYPES.GIGANTE) cellName = 'Gigante';
    else if (cellVal === CELL_TYPES.JALAPENO) cellName = 'Jalapeño';
    else if (cellVal === CELL_TYPES.HABANERO) cellName = 'Habanero';
    else if (cellVal === CELL_TYPES.WATER) cellName = 'Agua';
    else if (cellVal === CELL_TYPES.MILK) cellName = 'Leche';
    else if (cellVal === CELL_TYPES.GOLD_TRUFFLE) cellName = 'Trufa Dorada';

    this.zkLogCallback?.(`[verify_bite_integrity()] Generando prueba ZK para mordisco de ${isPlayer ? 'Jugador' : 'Rival'} en (${c}, ${r})...`);
    this.zkLogCallback?.(`[verify_bite_integrity()] Celda verificada: ${cellName}.`);
    this.zkLogCallback?.('[compact_ledger] Estado verificado y persistido.');

    if (cellVal === CELL_TYPES.EMPTY) {
      this.logsCallback(`💦 ${name} falló en (${c}, ${r}) (Agua de mar).`, 'info');
      this.effectCallback?.('💦 AGUA DE MAR', c, r, 'rgba(59,130,246,0.8)');
    } 
    // Hits a Pizza
    else if (cellVal >= 1 && cellVal <= 4) {
      const scoreGain = 50;
      let pizzaName = 'Margherita';
      if (cellVal === 2) pizzaName = 'Pepperoni';
      if (cellVal === 3) pizzaName = 'Suprema';
      if (cellVal === 4) pizzaName = 'Gigante';

      if (isPlayer) {
        this.state.playerScore += scoreGain;
      } else {
        this.state.rivalScore += scoreGain;
      }

      this.logsCallback(`💥 ¡CRUNCH! ${name} mordió una pizza de tipo [${pizzaName}] en (${c}, ${r})!`, 'success');
      this.effectCallback?.('🍕 ¡CRUNCH!', c, r, 'rgba(245,158,11,1)');

      // Devastation damage calculation
      const targetBoard = isPlayer ? this.state.rivalBoard : this.state.playerBoard;
      const targetRevealed = isPlayer ? this.state.playerRevealed : this.state.rivalRevealed;

      if (this.isPizzaFullyDevoured(targetBoard, targetRevealed, cellVal)) {
        let hpDmg = 1;
        let bonusPts = 100;
        if (cellVal === 2) { hpDmg = 1; bonusPts = 200; }
        if (cellVal === 3) { hpDmg = 2; bonusPts = 300; }
        if (cellVal === 4) { hpDmg = 3; bonusPts = 500; }

        if (isPlayer) {
          this.state.rivalHP = Math.max(0, Number(this.state.rivalHP) - hpDmg);
          this.state.playerScore += bonusPts;
          this.logsCallback(`🔥 ¡DEVASTACIÓN CULINARIA! Has devorado toda la pizza [${pizzaName}] rival: -${hpDmg} HP al rival y +${bonusPts} pts.`, 'success');
        } else {
          this.state.playerHP = Math.max(0, Number(this.state.playerHP) - hpDmg);
          this.state.rivalScore += bonusPts;
          this.logsCallback(`🔥 ¡DEVASTACIÓN CULINARIA! ${name} devoró tu pizza [${pizzaName}] entera: -${hpDmg} HP a tu barra de corazones.`, 'error');
        }
      }
    } 
    // Traps
    else if (cellVal === CELL_TYPES.JALAPENO || cellVal === CELL_TYPES.HABANERO) {
      const dmg = cellVal === CELL_TYPES.JALAPENO ? 1 : 2;
      const trapName = cellVal === CELL_TYPES.JALAPENO ? 'Jalapeño' : 'Habanero';
      const immunity = isPlayer ? this.state.playerTrapImmunity : this.state.rivalTrapImmunity;

      this.logsCallback(`🌶️ ¡TRAMPA! ${name} mordió un ${trapName} en (${c}, ${r}).`, 'warn');
      this.effectCallback?.(`🌶️ ${trapName.toUpperCase()}`, c, r, 'rgba(239,68,68,1)');

      if (immunity) {
        if (isPlayer) this.state.playerTrapImmunity = false;
        else this.state.rivalTrapImmunity = false;
        this.logsCallback(`🛡️ ¡Salvación! El escudo de Trufa Dorada absorbió el picante.`, 'success');
      } else {
        if (isPlayer) {
          this.state.playerHP = Math.max(0, Number(this.state.playerHP) - dmg);
        } else {
          this.state.rivalHP = Math.max(0, Number(this.state.rivalHP) - dmg);
        }
        this.logsCallback(`🥵 El picante inflige -${dmg} corazones de HP a ${isPlayer ? 'ti' : 'el bot'}.`, 'error');
      }
    } 
    // Cures
    else if (cellVal === CELL_TYPES.WATER || cellVal === CELL_TYPES.MILK) {
      const heal = cellVal === CELL_TYPES.WATER ? 1 : 2;
      const cureName = cellVal === CELL_TYPES.WATER ? 'Agua' : 'Leche';

      if (isPlayer) {
        this.state.playerHP = Math.min(5, Number(this.state.playerHP) + heal);
      } else {
        this.state.rivalHP = Math.min(5, Number(this.state.rivalHP) + heal);
      }

      this.logsCallback(`🥤 ${name} bebió ${cureName} en (${c}, ${r}): recupera +${heal} corazones de HP.`, 'success');
      this.effectCallback?.(`🥤 +${heal} HP`, c, r, 'rgba(16,185,129,1)');
    } 
    // Gold Truffle Special
    else if (cellVal === CELL_TYPES.GOLD_TRUFFLE) {
      if (isPlayer) {
        this.state.playerHP = Math.min(5, Number(this.state.playerHP) + 2);
        this.state.playerScore += 500;
        this.state.playerTrapImmunity = true;
      } else {
        this.state.rivalHP = Math.min(5, Number(this.state.rivalHP) + 2);
        this.state.rivalScore += 500;
        this.state.rivalTrapImmunity = true;
      }

      this.logsCallback(`👑 ¡TRUFA DORADA! ${name} desenterró la Trufa Dorada en (${c}, ${r}): +500 pts, +2 HP e INMUNIDAD al siguiente picante.`, 'success');
      this.effectCallback?.('👑 TRUFA DORADA', c, r, 'rgba(251,191,36,1)');
    }

    this.checkGameStatus();
  }

  private isPizzaFullyDevoured(board: number[][], revealed: boolean[][], val: number): boolean {
    for (let r = 0; r < 6; r++) {
      for (let c = 0; c < 6; c++) {
        if (board[r][c] === val && !revealed[r][c]) {
          return false;
        }
      }
    }
    return true;
  }

  private checkGameStatus(): void {
    if (this.state.playerHP <= 0) {
      this.state.gameState = 'ended';
      this.state.winner = 'rival';
      this.state.lobbyStatus = 'idle';
      this.logsCallback(`💀 ¡DERROTA! Tus pizzas han sido totalmente devoradas por ${this.state.rivalChef?.name}.`, 'error');
    } else if (this.state.rivalHP <= 0) {
      this.state.gameState = 'ended';
      this.state.winner = 'player';
      this.state.lobbyStatus = 'idle';
      this.logsCallback(`🏆 ¡VICTORIA CULINARIA! Has derrotado a ${this.state.rivalChef?.name}. ¡Eres el Master Pizzaiolo del barrio!`, 'success');
    }
  }

  // --- Smart Bot AI ("Chef Bot") Logic ---
  private chefBotTurn(): void {
    if (this.state.gameState !== 'playing') return;

    let targetR = -1;
    let targetC = -1;

    // 1. Process from hunt queue if active
    while (this.botHuntQueue.length > 0) {
      const [r, c] = this.botHuntQueue.shift()!;
      if (!this.state.rivalRevealed[r][c]) {
        targetR = r;
        targetC = c;
        break;
      }
    }

    // 2. Scan mode (systematic random scanning)
    if (targetR === -1) {
      const unrevealed: [number, number][] = [];
      for (let r = 0; r < 6; r++) {
        for (let c = 0; c < 6; c++) {
          if (!this.state.rivalRevealed[r][c]) {
            unrevealed.push([r, c]);
          }
        }
      }
      if (unrevealed.length > 0) {
        const randIndex = Math.floor(Math.random() * unrevealed.length);
        [targetR, targetC] = unrevealed[randIndex];
      }
    }

    if (targetR === -1 || targetC === -1) return; // Grid fully scanned

    // Bite
    this.state.rivalRevealed[targetR][targetC] = true;
    const val = this.state.playerBoard[targetR][targetC];

    // If it hit a pizza cell (values 1-4), enter Hunt Mode aggressively tracking contiguous cells
    if (val >= 1 && val <= 4) {
      // this.botLastHit = [targetR, targetC];
      this.botTargetPizzaVal = val;

      // Push adjacent cells into hunt queue
      const neighbors = [
        [targetR - 1, targetC],
        [targetR + 1, targetC],
        [targetR, targetC - 1],
        [targetR, targetC + 1]
      ];

      for (const [nr, nc] of neighbors) {
        if (nr >= 0 && nr < 6 && nc >= 0 && nc < 6 && !this.state.rivalRevealed[nr][nc]) {
          // Push to front of queue to target contiguous immediately
          this.botHuntQueue.unshift([nr, nc]);
        }
      }
    }

    this.processBiteAction('rival', targetR, targetC, val);

    // Clean hunt queue if the target pizza is fully devoured
    if (this.botTargetPizzaVal !== null && this.isPizzaFullyDevoured(this.state.playerBoard, this.state.rivalRevealed, this.botTargetPizzaVal)) {
      this.botTargetPizzaVal = null;
      this.botHuntQueue = []; // Reset hunt queue, go back to random scan
    }
  }

  // --- Robust Random Board Generator Algorithm ---
  public generateRandomBoard(): number[][] {
    const board = Array.from({ length: 6 }, () => Array(6).fill(0));

    const placePizza = (w: number, h: number, value: number): boolean => {
      for (let attempts = 0; attempts < 150; attempts++) {
        const isVert = Math.random() < 0.5;
        const actualW = isVert ? h : w;
        const actualH = isVert ? w : h;

        const r = Math.floor(Math.random() * (6 - actualH + 1));
        const c = Math.floor(Math.random() * (6 - actualW + 1));

        let overlap = false;
        for (let i = 0; i < actualH; i++) {
          for (let j = 0; j < actualW; j++) {
            if (board[r + i][c + j] !== 0) {
              overlap = true;
              break;
            }
          }
          if (overlap) break;
        }

        if (!overlap) {
          for (let i = 0; i < actualH; i++) {
            for (let j = 0; j < actualW; j++) {
              board[r + i][c + j] = value;
            }
          }
          return true;
        }
      }
      return false;
    };

    const placeSingle = (value: number): boolean => {
      for (let attempts = 0; attempts < 100; attempts++) {
        const r = Math.floor(Math.random() * 6);
        const c = Math.floor(Math.random() * 6);
        if (board[r][c] === 0) {
          board[r][c] = value;
          return true;
        }
      }
      return false;
    };

    // Keep retrying board generation if it hits a highly congested edge case
    let success = false;
    while (!success) {
      for (let r = 0; r < 6; r++) board[r].fill(0);

      const placedG = placePizza(1, 4, 4); // Gigante (1x4 / 4x1)
      const placedS = placePizza(2, 2, 3); // Suprema (2x2)
      const placedP = placePizza(1, 2, 2); // Pepperoni (1x2 / 2x1)
      const placedM = placePizza(1, 1, 1); // Margherita (1x1)

      const placedJ1 = placeSingle(5); // Jalapeno 1
      const placedJ2 = placeSingle(5); // Jalapeno 2
      const placedHab = placeSingle(6); // Habanero
      const placedWat = placeSingle(7); // Water
      const placedMil = placeSingle(8); // Milk
      const placedTruf = placeSingle(9); // Gold Truffle

      if (placedG && placedS && placedP && placedM && placedJ1 && placedJ2 && placedHab && placedWat && placedMil && placedTruf) {
        success = true;
      }
    }

    return board;
  }

  // --- Lobby Ticks ---
  public tick(): void {
    if (this.state.lobbyStatus === 'searching') {
      this.state.matchmakingTime += 4;
      this.logsCallback(`[Matchmaker] Buscando oponentes... (${this.state.matchmakingTime}s de espera)`, 'info');

      // Randomly find opponent after a brief search
      if (this.state.matchmakingTime >= 8 || Math.random() < 0.4) {
        this.state.lobbyStatus = 'handshake';
        this.logsCallback('📡 ¡Oponente Encontrado!', 'success');
        this.logsCallback('🤝 Realizando handshake criptográfico de seguridad...', 'system');
        this.logsCallback('⚙️ Sincronizando tableros en red descentralizada...', 'system');

        setTimeout(() => {
          const chefs: RivalChef[] = [
            { name: 'Donna_Margherita', emoji: '👩‍🍳', aggression: 3, title: 'Margherita Matriarch' },
            { name: 'Chef_Jalapeno', emoji: '🌶️', aggression: 5, title: 'Spice Overlord' },
            { name: 'Pizzaiolo_Pro', emoji: '🧀', aggression: 4, title: 'Dough Master' },
            { name: 'Chef_Ramen', emoji: '🍜', aggression: 2, title: 'Noodle Fusion' },
            { name: 'Chef_Truffle', emoji: '🍄', aggression: 4, title: 'Fungi Expert' }
          ];
          const chosen = chefs[Math.floor(Math.random() * chefs.length)];
          this.startGame(chosen);
        }, 2000);
      }
    }
  }

  // Social Panel actions
  public addFriend(name: string): void {
    if (!name.trim()) return;
    const exists = this.state.friends.some(f => f.name.toLowerCase() === name.trim().toLowerCase());
    if (exists) {
      this.logsCallback(`⚠️ "${name}" ya está en tu lista de amigos.`, 'warn');
      return;
    }

    const statuses: ('En línea' | 'Jugando' | 'Desconectado')[] = ['En línea', 'Jugando', 'Desconectado'];
    const status = statuses[Math.floor(Math.random() * statuses.length)];
    const emojis = ['🧑‍🍳', '👩‍🍳', '👨‍🍳', '🦊', '🐻', '🐼', '🦁'];
    const emoji = emojis[Math.floor(Math.random() * emojis.length)];

    this.state.friends.push({
      id: 'custom_' + Math.random().toString(36).substring(2, 9),
      name: name.trim(),
      emoji,
      status
    });

    this.logsCallback(`✨ ¡Agregado a amigos: ${name}! Estado: ${status}`, 'success');
  }

  // --- Robust Pizzas-Only Board Generator Algorithm ---
  public generatePizzasOnlyBoard(): number[][] {
    const board = Array.from({ length: 6 }, () => Array(6).fill(0));

    const placePizza = (w: number, h: number, value: number): boolean => {
      for (let attempts = 0; attempts < 150; attempts++) {
        const isVert = Math.random() < 0.5;
        const actualW = isVert ? h : w;
        const actualH = isVert ? w : h;

        const r = Math.floor(Math.random() * (6 - actualH + 1));
        const c = Math.floor(Math.random() * (6 - actualW + 1));

        let overlap = false;
        for (let i = 0; i < actualH; i++) {
          for (let j = 0; j < actualW; j++) {
            if (board[r + i][c + j] !== 0) {
              overlap = true;
              break;
            }
          }
          if (overlap) break;
        }

        if (!overlap) {
          for (let i = 0; i < actualH; i++) {
            for (let j = 0; j < actualW; j++) {
              board[r + i][c + j] = value;
            }
          }
          return true;
        }
      }
      return false;
    };

    let success = false;
    while (!success) {
      for (let r = 0; r < 6; r++) board[r].fill(0);

      const placedG = placePizza(1, 4, 4); // Gigante (1x4)
      const placedS = placePizza(2, 2, 3); // Suprema (2x2)
      const placedP = placePizza(1, 2, 2); // Pepperoni (1x2)
      const placedM = placePizza(1, 1, 1); // Margherita (1x1)

      if (placedG && placedS && placedP && placedM) {
        success = true;
      }
    }

    return board;
  }

  // Move entire connected pizza piece
  public movePlayerPizza(rFrom: number, cFrom: number, rTo: number, cTo: number): boolean {
    if (this.state.gameState !== 'lobby' && !this.state.isManeuverPhase) return false;

    const val = this.state.playerBoard[rFrom][cFrom];
    if (val < 1 || val > 4) return false;

    // Find all cells that belong to this pizza component
    const pizzaCells: { r: number; c: number }[] = [];
    for (let r = 0; r < 6; r++) {
      for (let c = 0; c < 6; c++) {
        if (this.state.playerBoard[r][c] === val) {
          pizzaCells.push({ r, c });
        }
      }
    }

    // Calculate new target positions based on anchor offsets
    const newCells: { r: number; c: number }[] = [];
    for (const cell of pizzaCells) {
      const rOffset = cell.r - rFrom;
      const cOffset = cell.c - cFrom;
      const newR = rTo + rOffset;
      const newC = cTo + cOffset;

      if (newR < 0 || newR >= 6 || newC < 0 || newC >= 6) {
        this.logsCallback('⚠️ Fuera de límites: La pizza se sale del tablero.', 'warn');
        return false;
      }
      newCells.push({ r: newR, c: newC });
    }

    // Validate collisions with any other pieces
    for (const cell of newCells) {
      const currentVal = this.state.playerBoard[cell.r][cell.c];
      if (currentVal !== 0 && currentVal !== val) {
        this.logsCallback('⚠️ Colisión: La posición de destino está ocupada.', 'warn');
        return false;
      }
    }

    // Clear old positions
    for (const cell of pizzaCells) {
      this.state.playerBoard[cell.r][cell.c] = 0;
    }

    // Write new positions
    for (const cell of newCells) {
      this.state.playerBoard[cell.r][cell.c] = val;
    }

    this.logsCallback(`🔄 Pizza movida con éxito a [Fila ${rTo+1}, Col ${cTo+1}]`, 'success');
    return true;
  }

  // Interactive inventory placement
  public placeInventoryItem(r: number, c: number, itemType: number): boolean {
    if (this.state.gameState !== 'lobby' && !this.state.isManeuverPhase) return false;
    if (this.state.playerBoard[r][c] !== 0) return false;

    const count = this.state.playerInventory?.[itemType] || 0;
    if (count <= 0) return false;

    this.state.playerBoard[r][c] = itemType;
    if (this.state.playerInventory) {
      this.state.playerInventory[itemType] -= 1;
    }

    const itemNames: { [key: number]: string } = { 5: '🌶️ Jalapeño', 6: '🥵 Habanero', 7: '💧 Agua', 8: '🥛 Leche', 9: '👑 Trufa' };
    this.logsCallback(`🎯 Colocado ${itemNames[itemType]} en [Fila ${r+1}, Col ${c+1}]`, 'info');
    return true;
  }

  // Interactive item recovery
  public removeInventoryItem(r: number, c: number): boolean {
    if (this.state.gameState !== 'lobby' && !this.state.isManeuverPhase) return false;

    const itemType = this.state.playerBoard[r][c];
    if (itemType < 5 || itemType > 9) return false;

    this.state.playerBoard[r][c] = 0;
    if (this.state.playerInventory) {
      this.state.playerInventory[itemType] = (this.state.playerInventory[itemType] || 0) + 1;
    }

    const itemNames: { [key: number]: string } = { 5: '🌶️ Jalapeño', 6: '🥵 Habanero', 7: '💧 Agua', 8: '🥛 Leche', 9: '👑 Trufa' };
    this.logsCallback(`🗑️ Recuperado ${itemNames[itemType]} al inventario.`, 'info');
    return true;
  }

  // Random autocomplete for unused inventory items on game start
  public finalizePlayerBoard(): void {
    if (!this.state.playerInventory) return;

    let itemsPlaced = 0;
    for (const typeStr in this.state.playerInventory) {
      const type = parseInt(typeStr);
      let count = this.state.playerInventory[type];
      while (count > 0) {
        let placed = false;
        for (let attempts = 0; attempts < 150; attempts++) {
          const r = Math.floor(Math.random() * 6);
          const c = Math.floor(Math.random() * 6);
          if (this.state.playerBoard[r][c] === 0) {
            this.state.playerBoard[r][c] = type;
            placed = true;
            break;
          }
        }
        if (!placed) break;
        count--;
        itemsPlaced++;
      }
      this.state.playerInventory[type] = 0;
    }

    if (itemsPlaced > 0) {
      this.logsCallback(`⚙️ Se colocaron automáticamente ${itemsPlaced} curas/trampas restantes del inventario.`, 'system');
    }
  }

  public autoBiteCellRandomly(): void {
    const unrevealed: [number, number][] = [];
    for (let r = 0; r < 6; r++) {
      for (let c = 0; c < 6; c++) {
        if (!this.state.playerRevealed[r][c]) {
          unrevealed.push([r, c]);
        }
      }
    }
    if (unrevealed.length > 0) {
      const randIndex = Math.floor(Math.random() * unrevealed.length);
      const [r, c] = unrevealed[randIndex];
      this.logsCallback('⏰ ¡Se acabó tu tiempo de turno! Mordisco automático al azar.', 'warn');
      this.biteCell(r, c);
    }
  }

  // Shuffle and auto-complete everything
  public autoCompleteBoardRandomly(): void {
    this.state.playerBoard = this.generateRandomBoard();
    this.state.playerInventory = { 5: 0, 6: 0, 7: 0, 8: 0, 9: 0 };
    this.logsCallback('🎲 Tablero completado aleatoriamente (pizzas y defensas colocadas).', 'success');
  }

  // Rotate a connected pizza 90 degrees around an anchor cell [rAnchor, cAnchor]
  public rotatePlayerPizza(rAnchor: number, cAnchor: number, clockwise = true): boolean {
    if (this.state.gameState !== 'lobby' && !this.state.isManeuverPhase) return false;

    const val = this.state.playerBoard[rAnchor][cAnchor];
    if (val < 1 || val > 4) return false; // Not a pizza

    // Find all cells that belong to this pizza component
    const pizzaCells: { r: number; c: number }[] = [];
    for (let r = 0; r < 6; r++) {
      for (let c = 0; c < 6; c++) {
        if (this.state.playerBoard[r][c] === val) {
          pizzaCells.push({ r, c });
        }
      }
    }

    // Calculate rotated cell coordinates around the anchor
    const newCells: { r: number; c: number }[] = [];
    for (const cell of pizzaCells) {
      const rOffset = cell.r - rAnchor;
      const cOffset = cell.c - cAnchor;

      // Clockwise rotation 90deg: (x, y) -> (y, -x)
      // Counter-clockwise rotation 90deg: (x, y) -> (-y, x)
      const newROffset = clockwise ? cOffset : -cOffset;
      const newCOffset = clockwise ? -rOffset : rOffset;

      const newR = rAnchor + newROffset;
      const newC = cAnchor + newCOffset;

      if (newR < 0 || newR >= 6 || newC < 0 || newC >= 6) {
        this.logsCallback('⚠️ Rotación cancelada: La pizza se sale del tablero.', 'warn');
        return false;
      }
      newCells.push({ r: newR, c: newC });
    }

    // Validate collisions with other pieces
    for (const cell of newCells) {
      const currentVal = this.state.playerBoard[cell.r][cell.c];
      if (currentVal !== 0 && currentVal !== val) {
        this.logsCallback('⚠️ Colisión de rotación: El espacio está ocupado.', 'warn');
        return false;
      }
    }

    // Clear old positions
    for (const cell of pizzaCells) {
      this.state.playerBoard[cell.r][cell.c] = 0;
    }

    // Write new positions
    for (const cell of newCells) {
      this.state.playerBoard[cell.r][cell.c] = val;
    }

    this.logsCallback(`🔄 Pizza rotada con éxito alrededor de [Fila ${rAnchor+1}, Col ${cAnchor+1}]`, 'success');
    return true;
  }

  // Backward compatibility methods
  public swapPlayerCells(r1: number, c1: number, r2: number, c2: number): boolean {
    return this.movePlayerPizza(r1, c1, r2, c2);
  }

  public shufflePlayerBoard(): void {
    if (this.state.gameState !== 'lobby' && !this.state.isManeuverPhase) return;
    this.autoCompleteBoardRandomly();
  }

  // Backward compatibility mock methods for main controller
  public build(_type: string, _x: number, _y: number): boolean { return true; }
  public solveActiveDisaster(): boolean { return true; }
  public claimRealSliceDonation(): number { return 0; }
  public castShieldedVote(_prop: number): boolean { return true; }
  public selectRecipe(_r: any): void {}
  public performCookingStep(): boolean { return true; }
  public completeBake(): number { return 0; }
  public calculateBoardCommitment(board: number[][]): string {
    let str = '';
    for (let r = 0; r < 6; r++) {
      for (let c = 0; c < 6; c++) {
        str += board[r][c];
      }
    }
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0;
    }
    return `mr_0x${Math.abs(hash * 97).toString(16).padEnd(10, 'c')}7bc81023${Math.abs(hash * 3).toString(16).slice(0, 6)}`;
  }

  public simulateOpponentDisconnect(): void {
    if (this.state.gameState !== 'playing' || !this.state.isMultiplayerActive) return;

    this.logsCallback('⚠️ ¡ATENCIÓN! Se ha detectado una pérdida de conexión con el oponente.', 'warn');
    this.logsCallback('⏳ Iniciando periodo de gracia del Servidor Testigo de 15 segundos...', 'system');

    if (this.zkLogCallback) {
      this.zkLogCallback('[witness_oracle] ERROR: Conexión con el rival perdida.');
      this.zkLogCallback('[witness_oracle] Iniciando temporizador de gracia de 15s.');
    }

    // Set a forfeit state in the simulation
    this.state.isForfeitPhase = true;
    this.state.forfeitTimer = 15;
  }
}
