// Reglas de combate autoritativas v1 — puerto 1:1 de la lógica que vivía en backend/main.go.
//   0        celda vacía (agua): fallo, sin efecto
//   1-4      rebanada de pizza: el defensor pierde 1 HP, el atacante suma +100 pts
//   5        jalapeño (trampa): el atacante pierde 1 HP (o consume inmunidad)
//   6        habanero (trampa): el atacante pierde 2 HP (o consume inmunidad)
//   7        agua (cura): el atacante recupera +1 HP (máx 5)
//   8        leche (cura): el atacante recupera +2 HP (máx 5)
//   9        trufa de oro: el atacante suma +500 pts y gana inmunidad
export interface PlayerState {
  hp: number;
  score: number;
  immunity: boolean;
}

export function applyBite(attacker: PlayerState, defender: PlayerState, val: number) {
  if (val >= 1 && val <= 4) {
    defender.hp -= 1;
    attacker.score += 100;
  } else if (val === 5) {
    if (attacker.immunity) attacker.immunity = false;
    else attacker.hp -= 1;
  } else if (val === 6) {
    if (attacker.immunity) attacker.immunity = false;
    else attacker.hp -= 2;
  } else if (val === 7) {
    attacker.hp += 1;
  } else if (val === 8) {
    attacker.hp += 2;
  } else if (val === 9) {
    attacker.score += 500;
    attacker.immunity = true;
  }
  attacker.hp = Math.max(0, Math.min(5, attacker.hp));
  defender.hp = Math.max(0, defender.hp);
}

export function defaultRival(username: string) {
  return {
    name: username || 'Cyber Pizzaiolo',
    emoji: '🧑‍🍳',
    title: 'Rival Soroban',
    aggression: 4
  };
}

export function isValidBoard(board: unknown): board is number[][] {
  return Array.isArray(board) && board.length === 6 && board.every(row => Array.isArray(row) && row.length === 6);
}
