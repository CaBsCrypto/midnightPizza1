/* ==========================================================================
   🍕 PIZZA BATTLESHIP - CONTROLADOR CENTRAL DEL ACERCAMIENTO CULINARIO (MAIN)
   ========================================================================== */

import { PizzeriaSimulation } from './simulation';
import { PizzeriaUI } from './ui';
import { PizzeriaAudio } from './audio';

import { PizzeriaWallet } from './wallet';

class SimPizzaDAOApp {
  private simulation: PizzeriaSimulation;
  private ui: PizzeriaUI;
  private wallet: PizzeriaWallet;
  
  private lastTickTime = 0;

  constructor() {
    this.wallet = new PizzeriaWallet();

    // 1. Initialize simulation engine and logging hooks
    this.simulation = new PizzeriaSimulation((msg, type) => {
      this.ui.log(msg, type);

      // Play matching sounds for logs
      if (type === 'error') {
        PizzeriaAudio.playDisaster();
      } else if (type === 'success') {
        if (msg.includes('VICTORIA') || msg.includes('DEVASTACIÓN')) {
          PizzeriaAudio.playFanfare();
        } else if (msg.includes('TRUFA')) {
          PizzeriaAudio.playCoin();
        }
      }
    });

    this.simulation.setZKLogCallback((msg) => {
      this.ui.logZK(msg);
    });

    this.simulation.setAnnouncementCallback((title, subtitle) => {
      this.ui.showAnnouncement(title, subtitle);
    });

    // 2. Initialize custom UI controls and link matchmaker/social hooks
    this.ui = new PizzeriaUI(
      () => {
        this.simulation.startMatchmaking();
      },
      () => {
        this.simulation.cancelMatchmaking();
      },
      (id) => {
        this.simulation.challengeFriend(id);
      },
      (name) => {
        this.simulation.addFriend(name);
      },
      () => {
        // Player Surrenders
        this.simulation.state.gameState = 'ended';
        this.simulation.state.winner = 'rival';
        this.simulation.state.playerHP = 0;
        this.simulation.state.lobbyStatus = 'idle';
        this.simulation.state.isMultiplayerActive = false;
        
        this.ui.log('🏳️ Te has rendido. El rival devoró las rebanadas restantes y ganó.', 'error');
        this.ui.updateHUD(this.simulation.state);
      },
      (r1, c1, r2, c2) => {
        this.simulation.swapPlayerCells(r1, c1, r2, c2);
        this.ui.updateHUD(this.simulation.state);
      },
      () => {
        this.simulation.shufflePlayerBoard();
        this.ui.updateHUD(this.simulation.state);
      },
      (r, c, type) => {
        this.simulation.placeInventoryItem(r, c, type);
        this.ui.updateHUD(this.simulation.state);
      },
      (r, c) => {
        this.simulation.removeInventoryItem(r, c);
        this.ui.updateHUD(this.simulation.state);
      },
      (r, c, clockwise) => {
        this.simulation.rotatePlayerPizza(r, c, clockwise);
        this.ui.updateHUD(this.simulation.state);
      },
      () => {
        this.simulation.simulateOpponentDisconnect();
        this.ui.updateHUD(this.simulation.state);
      },
      this.wallet
    );

    // 3. Hook cell bite callbacks directly from dynamic HTML boards
    this.ui.registerCellBiteCallback((r, c) => {
      if (this.simulation.state.gameState !== 'playing') return;
      if (this.simulation.state.isMultiplayerActive && !this.simulation.state.playerTurn) return;

      const val = this.simulation.state.rivalBoard[r][c];

      // Synthesize dynamic audio feedback
      if (val === 0) {
        PizzeriaAudio.playClick();
      } else if (val >= 1 && val <= 4) {
        PizzeriaAudio.playCrunch();
      } else if (val === 5 || val === 6) {
        PizzeriaAudio.playSizzle();
      } else if (val === 7 || val === 8) {
        PizzeriaAudio.playGulp();
      } else if (val === 9) {
        PizzeriaAudio.playCoin();
      }

      // Highlight Compact ZK panel lines dynamically to simulate ZK proof generation
      this.ui.highlightCompactZKLine(24); // verify_bite_integrity
      setTimeout(() => {
        this.ui.highlightCompactZKLine(29); // assert verify_bite_integrity
        setTimeout(() => {
          this.ui.clearZKHighlight();
        }, 600);
      }, 500);

      // Execute bite cell action in simulation
      this.simulation.biteCell(r, c);
    });

    // 4. Kick off continuous loop
    this.lastTickTime = performance.now();
    requestAnimationFrame((time) => this.gameLoop(time));
  }

  // Animation rendering frame orchestrator
  private gameLoop(time: number): void {
    // 1. Tick simulation matchmaking/idle counters every 4 seconds
    if (time - this.lastTickTime >= 4000) {
      this.simulation.tick();
      this.lastTickTime = time;
    }

    // 2. Synchronize active state telemetry in UI HUD panel
    this.ui.updateHUD(this.simulation.state);

    requestAnimationFrame((t) => this.gameLoop(t));
  }
}

// Instantiate Battleship app when DOM finishes loading
window.addEventListener('DOMContentLoaded', () => {
  new SimPizzaDAOApp();
});
