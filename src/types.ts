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

export interface Building {
  type: string;
  x: number;
  y: number;
  level: number;
  efficiency: number;
  wear: number;
}
export type BuildingType = string;
