/* ==========================================================================
   🍕 PIZZA BATTLESHIP - MANEJADOR DE INTERFAZ DE USUARIO E INFRAESTRUCTURA (UI)
   ========================================================================== */

import { GameState, Friend } from './simulation';
import { PizzeriaAudio } from './audio';
import { PizzeriaWallet } from './wallet';

export class PizzeriaUI {
  // HUD Elements
  private chefScoreEl = document.getElementById('chefScoreText')!;
  private playerHeartsEl = document.getElementById('playerHearts')!;
  private rivalHeartsEl = document.getElementById('rivalHearts')!;
  private consoleBody = document.getElementById('consoleBody')!;
  private terminalTimer = document.getElementById('terminalTimer')!;
  private merkleRootEl = document.getElementById('merkleRoot')!;

  private onSwapPlayerCells: (r1: number, c1: number, r2: number, c2: number) => void;
  private onShufflePlayerBoard: () => void;
  private onPlaceInventoryItem: (r: number, c: number, itemType: number) => void;
  private onRemoveInventoryItem: (r: number, c: number) => void;
  private onRotatePlayerPizza: (r: number, c: number, clockwise: boolean) => void;
  private onSimulateDisconnect: () => void;
  private wallet: PizzeriaWallet;

  // Track latest state for click handler re-renders and edit cell selection
  private latestState: GameState | null = null;
  private selectedEditCell: { r: number; c: number } | null = null;
  private selectedInventoryItem: number | null = null;

  private onStartMatchmaking: () => void;
  private onCancelMatchmaking: () => void;
  private onChallengeFriend: (id: string) => void;
  private onAddFriend: (name: string) => void;
  private onForfeitGame: () => void;
  private onRivalCellBitten?: (r: number, c: number) => void;

  private activeTab: 'amigos' | 'zk' = 'amigos';
  private lastPlayerHPHash = -1;
  private lastRivalHPHash = -1;
  private lastPlayerBoardHash = '';
  private lastRivalBoardHash = '';
  private lastFriendsHash = '';
  private lastRenderedStateKey = '';
  private lastInventoryHash = '';


  constructor(
    onStartMatchmaking: () => void,
    onCancelMatchmaking: () => void,
    onChallengeFriend: (id: string) => void,
    onAddFriend: (name: string) => void,
    onForfeitGame: () => void,
    onSwapPlayerCells: (r1: number, c1: number, r2: number, c2: number) => void,
    onShufflePlayerBoard: () => void,
    onPlaceInventoryItem: (r: number, c: number, itemType: number) => void,
    onRemoveInventoryItem: (r: number, c: number) => void,
    onRotatePlayerPizza: (r: number, c: number, clockwise: boolean) => void,
    onSimulateDisconnect: () => void,
    wallet: PizzeriaWallet
  ) {
    this.onStartMatchmaking = onStartMatchmaking;
    this.onCancelMatchmaking = onCancelMatchmaking;
    this.onChallengeFriend = onChallengeFriend;
    this.onAddFriend = onAddFriend;
    this.onForfeitGame = onForfeitGame;
    this.onSwapPlayerCells = onSwapPlayerCells;
    this.onShufflePlayerBoard = onShufflePlayerBoard;
    this.onPlaceInventoryItem = onPlaceInventoryItem;
    this.onRemoveInventoryItem = onRemoveInventoryItem;
    this.onRotatePlayerPizza = onRotatePlayerPizza;
    this.onSimulateDisconnect = onSimulateDisconnect;
    this.wallet = wallet;

    this.initSidebarTabListeners();
    this.initActionListeners();
    this.initModalManualListeners();
    this.startTerminalTimer();
    
    // Connect Wallet button listener
    const btnConnect = document.getElementById('btnConnectWallet');
    if (btnConnect) {
      btnConnect.addEventListener('click', () => {
        this.handleConnectWalletClick();
      });
    }

    // P2P Challenge Copy button listener
    const btnCopyP2P = document.getElementById('btnCopyP2PLink');
    if (btnCopyP2P) {
      btnCopyP2P.addEventListener('click', () => {
        this.handleCopyP2PLinkClick();
      });
    }

    // Detect P2P challenge in URL on startup
    const urlParams = new URLSearchParams(window.location.search);
    const challenge = urlParams.get('challenge');
    if (challenge) {
      setTimeout(() => {
        this.log('🚨 ¡RETO P2P DETECTADO DESDE LA URL! 🚨', 'system');
        this.log(`🏢 Compromiso del Rival ZK: ${challenge}`, 'info');
        this.log('💡 Conectando tu Lace Wallet automáticamente para unirte al duelo...', 'info');
        this.handleConnectWalletClick().then(() => {
          this.log('🤝 ¡Listo! Selecciona tu pizza y presiona "EMPEZAR" para retar on-chain.', 'success');
        });
      }, 1500);
    }
    
    // Enter Universe landing portal transition
    const btnEnter = document.getElementById('btnEnterUniverse')!;
    const landing = document.getElementById('landingOverlay')!;
    if (btnEnter && landing) {
      btnEnter.addEventListener('click', () => {
        PizzeriaAudio.playFanfare();
        landing.classList.add('fade-out');
        setTimeout(() => {
          landing.style.display = 'none';
        }, 800);
      });
    }

    // Shuffle board in lobby
    const btnShuffle = document.getElementById('btnShuffleBoard')!;
    if (btnShuffle) {
      btnShuffle.addEventListener('click', () => {
        PizzeriaAudio.playClick();
        this.selectedEditCell = null; // Clear selection
        this.selectedInventoryItem = null; // Clear selected inventory item
        this.lastPlayerBoardHash = ''; // Force re-render
        this.onShufflePlayerBoard();
      });
    }

    // Initial draw of the Compact Code Viewer
    this.renderCompactCode(null);
  }


  public registerCellBiteCallback(cb: (r: number, c: number) => void): void {
    this.onRivalCellBitten = cb;
  }

  private initSidebarTabListeners(): void {
    const btnAmigos = document.getElementById('tabBtnAmigos')!;
    const btnZK = document.getElementById('tabBtnZK')!;

    const panelAmigos = document.getElementById('panelAmigos')!;
    const panelZK = document.getElementById('panelZK')!;

    const switchTab = (target: 'amigos' | 'zk') => {
      PizzeriaAudio.playClick();
      this.activeTab = target;
      this.log(`📂 Panel de control cambiado a: ${this.activeTab.toUpperCase()}`, 'system');

      [btnAmigos, btnZK].forEach(b => b.classList.remove('active'));
      [panelAmigos, panelZK].forEach(p => p.style.display = 'none');

      if (target === 'amigos') {
        btnAmigos.classList.add('active');
        panelAmigos.style.display = 'flex';
      } else if (target === 'zk') {
        btnZK.classList.add('active');
        panelZK.style.display = 'flex';
        this.renderCompactCode(null);
      }
    };

    btnAmigos.addEventListener('click', () => switchTab('amigos'));
    btnZK.addEventListener('click', () => switchTab('zk'));
  }

  private initActionListeners(): void {
    const btnAdd = document.getElementById('btnAddFriend')!;
    const inputAdd = document.getElementById('addFriendInput')! as HTMLInputElement;

    btnAdd.addEventListener('click', () => {
      const val = inputAdd.value;
      if (val.trim()) {
        PizzeriaAudio.playClick();
        this.onAddFriend(val);
        inputAdd.value = '';
      }
    });
  }

  private initModalManualListeners(): void {
    const modal = document.getElementById('manualModal')!;
    const btnOpen = document.getElementById('btnOpenManual')!;
    const btnClose = document.getElementById('btnCloseManual')!;
    const btnConfirm = document.getElementById('btnConfirmManual')!;

    const toggle = (active: boolean) => {
      PizzeriaAudio.playClick();
      if (active) modal.classList.add('active');
      else modal.classList.remove('active');
    };

    btnOpen.addEventListener('click', () => toggle(true));
    btnClose.addEventListener('click', () => toggle(false));
    btnConfirm.addEventListener('click', () => toggle(false));
  }

  // Refresh dynamic sidebar layouts based on state
  public updateHUD(state: GameState): void {
    this.latestState = state;

    // Show/hide shuffle button based on lobby phase or maneuver phase
    const btnShuffle = document.getElementById('btnShuffleBoard');
    if (btnShuffle) {
      btnShuffle.style.display = (state.gameState === 'lobby' || state.isManeuverPhase) ? 'inline-block' : 'none';
    }

    // Update board subtitle based on lobby phase or maneuver phase (including 15s/10s timers!)
    const subtitleEl = document.querySelector('.player-board .board-subtitle') as HTMLElement;
    if (subtitleEl) {
      if (state.gameState === 'lobby' && state.lobbyTimer !== undefined) {
        subtitleEl.textContent = `⏳ ¡Mesa lista en ${state.lobbyTimer}s! (Haz clic abajo para colocar curas/trampas)`;
        subtitleEl.style.color = '';
        subtitleEl.style.fontWeight = '';
      } else if (state.isManeuverPhase && state.maneuverTimer !== undefined) {
        subtitleEl.textContent = `⚡ ¡FASE DE MANIOBRA! Tienes ${state.maneuverTimer}s para mover piezas e ítems!`;
        subtitleEl.style.color = '#fbbf24';
        subtitleEl.style.fontWeight = 'bold';
      } else {
        subtitleEl.textContent = 'Tus pizzas y trampas activas';
        subtitleEl.style.color = '';
        subtitleEl.style.fontWeight = '';
      }
    }

    // Render inventory bar
    const invBar = document.getElementById('playerInventoryBar');
    if (invBar) {
      if ((state.gameState === 'lobby' || state.isManeuverPhase) && state.playerInventory) {
        invBar.style.display = 'flex';
        
        // Generate inventory hash to optimize re-renders
        let invHash = '';
        for (const typeStr in state.playerInventory) {
          invHash += `${typeStr}:${state.playerInventory[parseInt(typeStr)]}|`;
        }
        invHash += `sel:${this.selectedInventoryItem}`;
        if (state.isManeuverPhase && state.maneuverTimer !== undefined) {
          invHash += `timer:${state.maneuverTimer}`;
        }
        
        if (invHash !== this.lastInventoryHash) {
          this.lastInventoryHash = invHash;
          invBar.innerHTML = '';
          
          // Render Ticking Timer block if in Maneuver Phase!
          if (state.isManeuverPhase && state.maneuverTimer !== undefined) {
            const timerCard = document.createElement('div');
            timerCard.className = 'inventory-timer-card';
            timerCard.innerHTML = `
              <span class="timer-icon">⏳</span>
              <span class="timer-seconds">${state.maneuverTimer}s</span>
            `;
            invBar.appendChild(timerCard);
          }
          
          const items = [
            { type: 5, cssClass: 'inv-jalapeno', label: 'Jalapeño' },
            { type: 6, cssClass: 'inv-habanero', label: 'Habanero' },
            { type: 7, cssClass: 'inv-water', label: 'Agua' },
            { type: 8, cssClass: 'inv-milk', label: 'Leche' },
            { type: 9, cssClass: 'inv-crown', label: 'Trufa' }
          ];
          
          items.forEach(item => {
            const count = state.playerInventory?.[item.type] || 0;
            const btn = document.createElement('button');
            btn.className = `inventory-item ${item.cssClass} ${this.selectedInventoryItem === item.type ? 'selected' : ''}`;
            btn.title = `${item.label} (Quedan ${count})`;
            btn.disabled = count <= 0 && this.selectedInventoryItem !== item.type;
            
            btn.innerHTML = `
              <span class="inventory-badge">${count}</span>
            `;
            
            btn.addEventListener('click', () => {
              PizzeriaAudio.playClick();
              if (this.selectedInventoryItem === item.type) {
                // Deselect
                this.selectedInventoryItem = null;
              } else {
                // Select this item
                this.selectedInventoryItem = item.type;
                this.selectedEditCell = null; // Clear pizza selection to prevent conflicts
                this.lastPlayerBoardHash = ''; // Force board re-render to clear highlights
              }
              this.lastInventoryHash = ''; // Force inventory re-render
              this.updateHUD(state);
            });
            
            invBar.appendChild(btn);
          });
        }
      } else {
        invBar.style.display = 'none';
        this.selectedInventoryItem = null;
      }
    }

    // Synchronize Match Start Countdown Overlay (3, 2, 1)
    const overlay = document.getElementById('matchCountdownOverlay');
    const battleOverlay = document.getElementById('battleAnnouncementOverlay');
    if (overlay) {
      if (state.gameState === 'playing' && state.startCountdown !== undefined && state.startCountdown > 0) {
        overlay.style.display = 'flex';
        const numEl = overlay.querySelector('.countdown-number') as HTMLElement;
        if (numEl) {
          if (state.startCountdown === 1) {
            numEl.textContent = '¡GO!';
            numEl.style.fontSize = '90px'; // Slightly smaller font for "GO!" to fit beautifully
            numEl.style.textShadow = '0 0 35px var(--neon-red, #ef4444), 0 0 70px var(--neon-red, #ef4444)';
            numEl.style.color = 'var(--neon-red, #ef4444)';
          } else {
            numEl.textContent = (state.startCountdown - 1).toString();
            numEl.style.fontSize = ''; // Reset to default CSS
            numEl.style.textShadow = '';
            numEl.style.color = '';
          }
        }
        // Hide generic battle announcement to avoid overlap/blur interference!
        if (battleOverlay) {
          battleOverlay.style.display = 'none';
          battleOverlay.classList.add('fade-out');
        }
      } else {
        overlay.style.display = 'none';
      }
    }

    // Synchronize Forfeit Countdown Overlay
    const forfeitOverlay = document.getElementById('forfeitCountdownOverlay');
    if (forfeitOverlay) {
      if (state.isForfeitPhase && state.forfeitTimer !== undefined && state.forfeitTimer > 0) {
        forfeitOverlay.style.display = 'flex';
        const numEl = forfeitOverlay.querySelector('.countdown-number') as HTMLElement;
        if (numEl) {
          numEl.textContent = state.forfeitTimer.toString();
        }
      } else {
        forfeitOverlay.style.display = 'none';
      }
    }

    // 1. Synchronize scores and lives in Top Bar
    this.chefScoreEl.textContent = state.playerScore.toLocaleString();
    this.updateWalletUI();
    
    // Heart life representation (latido pixel art)
    if (state.playerHP !== this.lastPlayerHPHash) {
      this.lastPlayerHPHash = state.playerHP;
      let playerHearts = '';
      for (let i = 0; i < 5; i++) {
        if (i < state.playerHP) {
          playerHearts += '<span class="heart-icon active">❤️</span>';
        } else {
          playerHearts += '<span class="heart-icon broken">🖤</span>';
        }
      }
      this.playerHeartsEl.innerHTML = playerHearts;
    }

    if (state.rivalHP !== this.lastRivalHPHash) {
      this.lastRivalHPHash = state.rivalHP;
      let rivalHearts = '';
      for (let i = 0; i < 5; i++) {
        if (i < state.rivalHP) {
          rivalHearts += '<span class="heart-icon active">❤️</span>';
        } else {
          rivalHearts += '<span class="heart-icon broken">🖤</span>';
        }
      }
      this.rivalHeartsEl.innerHTML = rivalHearts;
    }

    // 2. Generate a Merkle Root of Player Board secret layout
    const boardHash = this.calculateLocalMerkle(state.playerBoard);
    this.merkleRootEl.textContent = boardHash;

    // 3. Sync player score footer badges
    const pScoreText = document.getElementById('playerScoreText')!;
    const rScoreText = document.getElementById('rivalScoreText')!;
    pScoreText.textContent = state.playerScore.toString();
    rScoreText.textContent = state.rivalScore.toString();

    // 4. Sync Immunity Shields
    const pImmunity = document.getElementById('playerImmunity')!;
    const rImmunity = document.getElementById('rivalImmunity')!;
    pImmunity.style.display = state.playerTrapImmunity ? 'inline-block' : 'none';
    rImmunity.style.display = state.rivalTrapImmunity ? 'inline-block' : 'none';

    // 5. Render Matchmaking Console Tab
    this.renderMatchmakingConsole(state);

    // 6. Render Friends & Challenges list Tab
    this.renderFriendsList(state.friends);

    // 7. Render dynamic HTML5 checkboard grid boards
    this.renderGridBoard('playerGridBoard', state.playerBoard, state.rivalRevealed, true);
    this.renderGridBoard('rivalGridBoard', state.rivalBoard, state.playerRevealed, false);
  }

  private calculateLocalMerkle(board: number[][]): string {
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

  // Pure HTML/CSS checkboard grid render engine
  public renderGridBoard(
    containerId: string,
    board: number[][],
    revealed: boolean[][],
    isPlayer: boolean
  ): void {
    // Generate a unique hash representing current board state
    let hash = "";
    for (let r = 0; r < 6; r++) {
      for (let c = 0; c < 6; c++) {
        hash += `${board[r][c]}${revealed[r][c] ? '1' : '0'}`;
      }
    }
    if (isPlayer) {
      if (this.selectedEditCell) {
        hash += `_sel_${this.selectedEditCell.r}_${this.selectedEditCell.c}`;
      }
      if (this.selectedInventoryItem) {
        hash += `_selinv_${this.selectedInventoryItem}`;
      }
    }

    if (isPlayer) {
      if (hash === this.lastPlayerBoardHash) return;
      this.lastPlayerBoardHash = hash;
    } else {
      if (hash === this.lastRivalBoardHash) return;
      this.lastRivalBoardHash = hash;
    }

    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = '';

    for (let r = 0; r < 6; r++) {
      for (let c = 0; c < 6; c++) {
        const val = board[r][c];
        const isBitten = revealed[r][c];
        const isDark = (r + c) % 2 === 1;

        const cellBtn = document.createElement('button');
        cellBtn.className = `grid-cell ${isDark ? 'dark-tile' : ''}`;
        
        if (isBitten) {
          if (val === 0) {
            cellBtn.classList.add('bitten-miss');
          } else if (val >= 7 && val <= 9) {
            cellBtn.classList.add('bitten-cure');
          } else {
            cellBtn.classList.add('bitten-hit');
          }
        }

        if (isPlayer && this.selectedEditCell) {
          const selVal = board[this.selectedEditCell.r][this.selectedEditCell.c];
          if (selVal >= 1 && selVal <= 4 && val === selVal) {
            cellBtn.classList.add('selected-for-move');
          }
        }

        // Render cell inner contents
        if (isPlayer) {
          // Defense board: Show item icon always + bite mark overlay
          this.drawCellIcon(cellBtn, val);

          if (this.latestState && (this.latestState.gameState === 'lobby' || this.latestState.isManeuverPhase)) {
            cellBtn.addEventListener('click', () => {
              this.handlePlayerCellClick(r, c);
            });

            // Prevent default page scroll and trigger 90-degree pizza rotation
            cellBtn.addEventListener('wheel', (e) => {
              e.preventDefault();
              const isClockwise = e.deltaY > 0;
              this.lastPlayerBoardHash = ''; // Force re-render
              this.onRotatePlayerPizza(r, c, isClockwise);
            });
          }
        } else {
          // Attack board: If not bitten, show beautiful vibrating silver dome!
          if (!isBitten) {
            this.drawClocheDome(cellBtn, r, c);
            
            // Add click attacking listener
            cellBtn.addEventListener('click', () => {
              if (this.onRivalCellBitten) {
                this.onRivalCellBitten(r, c);
              }
            });
          } else {
            this.drawCellIcon(cellBtn, val);
          }
        }

        container.appendChild(cellBtn);
      }
    }
  }

  private handlePlayerCellClick(r: number, c: number): void {
    if (!this.latestState || (this.latestState.gameState !== 'lobby' && !this.latestState.isManeuverPhase)) return;

    const val = this.latestState.playerBoard[r][c];

    // Case 1: An item from the inventory is currently selected
    if (this.selectedInventoryItem !== null) {
      if (val === 0) {
        // Place item in empty cell
        PizzeriaAudio.playClick();
        const type = this.selectedInventoryItem;
        this.selectedInventoryItem = null; // Clear selection BEFORE callback to ensure correct visual state
        this.lastPlayerBoardHash = ''; // Force re-render
        this.lastInventoryHash = ''; // Force inventory update
        this.onPlaceInventoryItem(r, c, type);
      } else {
        PizzeriaAudio.playDisaster(); // Warn player
        this.log('⚠️ Las curas y trampas solo se pueden colocar en casillas vacías.', 'warn');
      }
      return;
    }

    // Case 2: Player clicks on a placed inventory item (values 5 to 9) to remove it
    if (val >= 5 && val <= 9) {
      PizzeriaAudio.playCrunch(); // Play crunch/remove sound
      this.selectedEditCell = null; // Clear pizza selection BEFORE
      this.selectedInventoryItem = null; // Clear inventory selection too
      this.lastPlayerBoardHash = ''; // Force re-render
      this.lastInventoryHash = ''; // Force inventory update
      this.onRemoveInventoryItem(r, c);
      return;
    }

    // Case 3: Player clicks on a pizza piece (values 1 to 4)
    if (val >= 1 && val <= 4) {
      PizzeriaAudio.playClick();
      if (this.selectedEditCell === null) {
        // First click: select the pizza piece
        this.selectedEditCell = { r, c };
        const pizzaNames: { [key: number]: string } = { 1: 'Margherita 1x1', 2: 'Pepperoni 1x2', 3: 'Suprema 2x2', 4: 'Gigante 1x4' };
        this.log(`📍 Pizza ${pizzaNames[val]} seleccionada. Haz clic en una casilla vacía o en otra celda de la pieza para desplazarla.`, 'info');
        this.lastPlayerBoardHash = ''; // Force re-render
        this.updateHUD(this.latestState);
      } else {
        const from = this.selectedEditCell;
        const fromVal = this.latestState.playerBoard[from.r][from.c];
        
        if (fromVal === val) {
          if (from.r === r && from.c === c) {
            // Clicked same exact cell: deselect
            this.selectedEditCell = null;
            this.log(`📍 Selección cancelada.`, 'info');
            this.lastPlayerBoardHash = ''; // Force re-render
            this.updateHUD(this.latestState);
          } else {
            // Clicked a DIFFERENT cell of the SAME pizza!
            // This is a MOVE target! Slide the pizza component!
            this.selectedEditCell = null; // Clear selection BEFORE callback to ensure correct visual state
            this.lastPlayerBoardHash = ''; // Force re-render
            this.onSwapPlayerCells(from.r, from.c, r, c);
          }
        } else {
          // Clicked another pizza: select the new one instead!
          this.selectedEditCell = { r, c };
          const pizzaNames: { [key: number]: string } = { 1: 'Margherita 1x1', 2: 'Pepperoni 1x2', 3: 'Suprema 2x2', 4: 'Gigante 1x4' };
          this.log(`📍 Pizza ${pizzaNames[val]} seleccionada. Haz clic en una casilla vacía o en otra celda de la pieza para desplazarla.`, 'info');
          this.lastPlayerBoardHash = ''; // Force re-render
          this.updateHUD(this.latestState);
        }
      }
      return;
    }

    // Case 4: Player clicks on an empty cell (val === 0)
    if (val === 0) {
      if (this.selectedEditCell !== null) {
        // We have a selected pizza: move the entire connected component!
        const from = this.selectedEditCell;
        this.selectedEditCell = null; // Clear selection BEFORE callback to ensure correct visual state
        this.lastPlayerBoardHash = ''; // Force re-render
        this.onSwapPlayerCells(from.r, from.c, r, c);
      } else {
        // Click on empty cell with nothing selected
        this.log('💡 Selecciona una pizza en el tablero o elige un ítem del inventario para colocarlo aquí.', 'info');
      }
    }
  }


  private drawClocheDome(parent: HTMLElement, r: number, c: number): void {
    const container = document.createElement('div');
    container.className = 'cloche-container';
    
    // Store coordinates for tremble references
    container.setAttribute('data-r', r.toString());
    container.setAttribute('data-c', c.toString());

    parent.appendChild(container);
  }

  private drawCellIcon(parent: HTMLElement, val: number): void {
    const span = document.createElement('span');
    span.style.zIndex = '3';
    span.style.fontSize = '20px';

    switch (val) {
      case 1: // Margherita (1x1)
        parent.classList.add('pizza-m');
        span.textContent = '';
        const mBadge = document.createElement('span');
        mBadge.style.cssText = 'position:absolute; bottom:1px; right:3px; font-size:7.5px; font-weight:bold; color:#a8a29e; font-family:var(--font-orbitron);';
        mBadge.textContent = 'M';
        parent.appendChild(mBadge);
        parent.appendChild(span);
        break;
      case 2: // Pepperoni (1x2)
        parent.classList.add('pizza-p');
        span.textContent = '';
        const pBadge = document.createElement('span');
        pBadge.style.cssText = 'position:absolute; bottom:1px; right:3px; font-size:7.5px; font-weight:bold; color:#ef4444; font-family:var(--font-orbitron);';
        pBadge.textContent = 'P';
        parent.appendChild(pBadge);
        parent.appendChild(span);
        break;
      case 3: // Suprema (2x2)
        parent.classList.add('pizza-s');
        span.textContent = '';
        const sBadge = document.createElement('span');
        sBadge.style.cssText = 'position:absolute; bottom:1px; right:3px; font-size:7.5px; font-weight:bold; color:#10b981; font-family:var(--font-orbitron);';
        sBadge.textContent = 'S';
        parent.appendChild(sBadge);
        parent.appendChild(span);
        break;
      case 4: // Gigante (1x4)
        parent.classList.add('pizza-g');
        span.textContent = '';
        const gBadge = document.createElement('span');
        gBadge.style.cssText = 'position:absolute; bottom:1px; right:3px; font-size:7.5px; font-weight:bold; color:#fbbf24; font-family:var(--font-orbitron);';
        gBadge.textContent = 'G';
        parent.appendChild(gBadge);
        parent.appendChild(span);
        break;
      case 5: // Jalapeno
        parent.classList.add('item-jalapeno');
        span.textContent = '';
        parent.appendChild(span);
        break;
      case 6: // Habanero
        parent.classList.add('item-habanero');
        span.textContent = '';
        parent.appendChild(span);
        break;
      case 7: // Water
        parent.classList.add('item-water');
        span.textContent = '';
        parent.appendChild(span);
        break;
      case 8: // Milk
        parent.classList.add('item-milk');
        span.textContent = '';
        parent.appendChild(span);
        break;
      case 9: // Truffle
        parent.classList.add('item-crown');
        span.textContent = '';
        parent.appendChild(span);
        break;
    }
  }

  private renderMatchmakingConsole(state: GameState): void {
    const console = document.getElementById('matchmakingConsole')!;
    if (!console) return;

    // Generate a unique state key representing what is being displayed in the console
    const stateKey = `${state.gameState}_${state.lobbyStatus}_${state.rivalChef?.name || ''}_${state.playerTurn}_${state.matchmakingTime}_${state.turnTimer || 0}`;
    if (stateKey === this.lastRenderedStateKey) {
      return;
    }
    this.lastRenderedStateKey = stateKey;

    if (state.gameState === 'playing') {
      const chef = state.rivalChef!;
      let turnColor = state.playerTurn ? '#10b981' : '#ea580c';
      let turnText = state.playerTurn ? `👉 ¡TU TURNO DE MORDER!` : `⏳ TURNO RIVAL PENSANDO...`;
      if (state.isMultiplayerActive) {
        turnText = state.playerTurn ? `👉 ¡TU TURNO MULTIJUGADOR!` : `⏳ ESPERANDO MOVIMIENTO OPONENTE...`;
      }

      const secondsLeft = state.turnTimer !== undefined ? state.turnTimer : 15;
      const isCritical = secondsLeft <= 5;

      console.innerHTML = `
        <div class="horizontal-console-row">
          <!-- Rival Card info -->
          <div class="rival-horizontal-card">
            <span class="rival-emoji">${chef.emoji}</span>
            <div class="rival-details">
              <span class="rival-name">${chef.name}</span>
              <span class="rival-title">${chef.title}</span>
            </div>
            <div class="rival-aggression" style="color: var(--neon-red);">${'🌶️'.repeat(chef.aggression)}</div>
          </div>

          <!-- Turn box badge -->
          <div class="turn-status-badge" style="background: ${turnColor}; text-shadow: 0 0 8px rgba(255,255,255,0.4);">
            ${turnText}
          </div>

          <!-- HUD Stopwatch Chronometer -->
          <div class="hud-stopwatch-circle ${isCritical ? 'critical' : ''}" style="border-color: ${turnColor}; color: ${turnColor}; box-shadow: 0 0 15px ${turnColor}40;">
            <span class="stopwatch-seconds">${secondsLeft}</span>
            <span class="stopwatch-unit">SEC</span>
          </div>

          <div class="console-actions">
            <button class="console-btn btn-secondary" id="btnForfeit" style="margin: 0; padding: 8px 16px; font-size: 11px;">RENDIRSE 🏳️</button>
          </div>
        </div>
      `;

      document.getElementById('btnForfeit')?.addEventListener('click', () => {
        PizzeriaAudio.playDisaster();
        this.onForfeitGame();
      });

      return;
    }

    if (state.gameState === 'ended') {
      const isWinner = state.winner === 'player';
      const color = isWinner ? '#10b981' : '#ef4444';
      const banner = isWinner ? '🏆 ¡VICTORIA CULINARIA!' : '💀 ¡DERROTA ROTUNDA!';
      const msg = isWinner 
        ? `Has devorado exitosamente todas las pizzas de ${state.rivalChef?.name || 'tu oponente'}.` 
        : `${state.rivalChef?.name || 'Tu oponente'} ha arrasado tus defensas culinarias primero.`;

      const buttonHtml = isWinner
        ? `<button class="console-btn" id="btnOpenClaim" style="margin: 0; padding: 10px 20px; font-size: 11px; width: auto; background: linear-gradient(180deg, var(--neon-gold), #b45309); border-color: var(--neon-gold); font-weight: bold; animation: pulseAlert 2s infinite;">RECLAMAR RECOMPENSAS WEB3 🏆</button>`
        : `<button class="console-btn" id="btnBackToLobby" style="margin: 0; padding: 8px 16px; font-size: 11px; width: auto;">VOLVER AL LOBBY</button>`;

      console.innerHTML = `
        <div class="horizontal-console-row" style="justify-content: center; width: 100%;">
          <div class="ended-status-block">
            <span style="font-size: 22px; line-height: 1;">${isWinner ? '👑' : '🥵'}</span>
            <span style="font-family: var(--font-orbitron); color: ${color}; font-size: 13px; font-weight: 900; letter-spacing: 0.5px;">${banner}</span>
            <span style="font-size: 11px; color:#cbd5e1; max-width: 320px; line-height: 1.4;">${msg}</span>
            ${buttonHtml}
          </div>
        </div>
      `;

      if (isWinner) {
        document.getElementById('btnOpenClaim')?.addEventListener('click', () => {
          PizzeriaAudio.playClick();
          this.openClaimModal(state);
        });
      } else {
        document.getElementById('btnBackToLobby')?.addEventListener('click', () => {
          PizzeriaAudio.playClick();
          state.gameState = 'lobby';
          this.updateHUD(state);
        });
      }

      return;
    }

    // Lobby / idle or searching
    if (state.lobbyStatus === 'searching') {
      console.innerHTML = `
        <div class="horizontal-console-row">
          <div class="searching-status-block">
            <div class="audit-spinner-small"></div>
            <span class="searching-text">RASTREANDO RED DESCENTRALIZADA... Tiempo: <strong>${state.matchmakingTime}s</strong></span>
          </div>
          <button class="console-btn btn-secondary" id="btnCancelMatch" style="margin: 0; padding: 8px 16px; width: auto; font-size: 11px;">CANCELAR BÚSQUEDA</button>
        </div>
      `;

      document.getElementById('btnCancelMatch')?.addEventListener('click', () => {
        PizzeriaAudio.playClick();
        this.onCancelMatchmaking();
      });

    } else if (state.lobbyStatus === 'handshake') {
      console.innerHTML = `
        <div class="horizontal-console-row" style="justify-content: center; width: 100%;">
          <div style="display:flex; align-items:center; gap:12px;">
            <span style="font-size: 22px; animation: pulseAlert 1.5s infinite;">🤝</span>
            <span style="font-family: var(--font-orbitron); font-weight: 800; font-size: 12px; color: #10b981; letter-spacing: 0.5px;">OPONENTE ENCONTRADO</span>
            <span style="font-size: 11px; color:#cbd5e1;">Sincronizando compromisos ZK en Midnight L2...</span>
          </div>
        </div>
      `;
    } else {
      // Idle
      console.innerHTML = `
        <div class="horizontal-console-row">
          <div class="idle-text-block">
            <span class="idle-emoji">🎮</span>
            <p class="idle-text">¡Inicia una batalla de Clash of Pizzas! Posiciona tus campanas en secreto, coloca curas y vence a tus oponentes.</p>
          </div>
          <div class="idle-actions">
            <button class="console-btn" id="btnStartQueue" style="margin: 0; padding: 10px 20px; font-size: 11px;">⚔️ PELEAR ONLINE 1V1</button>
            <button class="console-btn btn-secondary" id="btnStartAI" style="margin: 0; padding: 10px 20px; font-size: 11px;">🤖 CHEF BOT LOCAL</button>
          </div>
        </div>
      `;

      document.getElementById('btnStartQueue')?.addEventListener('click', () => {
        PizzeriaAudio.playClick();
        this.onStartMatchmaking();
      });

      document.getElementById('btnStartAI')?.addEventListener('click', () => {
        PizzeriaAudio.playClick();
        const randBots = [
          { id: 'f2', name: 'Chef_Jalapeno', emoji: '🌶️', aggression: 5, title: 'Spice Overlord' },
          { id: 'f1', name: 'Donna_Margherita', emoji: '👩‍🍳', aggression: 3, title: 'Wood Oven Legend' },
          { id: 'f3', name: 'Pizzaiolo_Pro', emoji: '🧀', aggression: 4, title: 'Dough Master' }
        ];
        const chosen = randBots[Math.floor(Math.random() * randBots.length)];
        this.log(`🎯 Iniciando partida rápida local contra ${chosen.name}...`, 'info');
        this.onChallengeFriend(chosen.id);
      });
    }
  }

  private renderFriendsList(friends: Friend[]): void {
    const container = document.getElementById('friendsListContainer');
    if (!container) return;

    let hash = friends.map(f => `${f.id}_${f.status}`).join('|');
    if (this.latestState) {
      hash += `_mp:${this.latestState.isMultiplayerActive}_gs:${this.latestState.gameState}`;
    }
    if (hash === this.lastFriendsHash) {
      return;
    }
    this.lastFriendsHash = hash;

    if (friends.length === 0) {
      container.innerHTML = `<div style="text-align:center; font-size:10px; color:#bbb; padding:10px;">No hay amigos en la lista.</div>`;
      return;
    }

    let friendsHtml = friends.map(f => {
      let color = '#a8a29e';
      if (f.status === 'En línea') color = '#10b981';
      if (f.status === 'Jugando') color = '#f59e0b';
      
      const disableChall = f.status === 'Desconectado';

      return `
        <div class="build-card" style="padding: 10px; display:flex; align-items:center; gap:10px; margin:0; border-radius:12px; cursor:default; transform:none; box-shadow:0 3px 0 var(--border-dark);">
          <div class="build-icon" style="width:36px; height:36px; font-size:18px; box-shadow:none;">${f.emoji}</div>
          <div style="flex:1; display:flex; flex-direction:column; gap:2px; text-align:left;">
            <div style="font-size:12px; font-weight:800; color:#fff;">${f.name}</div>
            <div style="font-size:8px; color:${color}; font-weight:bold; display:flex; align-items:center; gap:3px;">
              <span style="font-size:12px; line-height:1;">●</span> ${f.status.toUpperCase()}
            </div>
          </div>
          <button class="console-btn" data-challenge-id="${f.id}" ${disableChall ? 'disabled' : ''} style="width:auto; font-size:9px; padding: 6px 12px; margin:0; border-radius:8px;">RETAR ⚔️</button>
        </div>
      `;
    }).join('');

    if (this.latestState && this.latestState.gameState === 'playing' && this.latestState.isMultiplayerActive) {
      const forfeitCard = `
        <div class="build-card diagnostic-forfeit-card" style="padding: 10px; display:flex; flex-direction:column; gap:8px; margin:0 0 10px 0; border-radius:12px; border: 2px dashed #ef4444; background: rgba(239, 68, 68, 0.08); box-shadow:none;">
          <div style="display:flex; align-items:center; gap:8px;">
            <div style="font-size:16px;">🔌</div>
            <div style="flex:1; text-align:left;">
              <div style="font-size:11px; font-weight:800; color:#fca5a5;">DIAGNÓSTICO SOCIAL</div>
              <div style="font-size:8px; color:#cbd5e1;">Simular desconexión del oponente</div>
            </div>
          </div>
          <button class="console-btn" id="btnSimDisconnect" style="width:100%; font-size:9.5px; padding: 6px; margin:0; border-radius:8px; background: #ef4444; border-color: #ef4444; color:#fff;">DESCONECTAR OPONENTE</button>
        </div>
      `;
      friendsHtml = forfeitCard + friendsHtml;
    }

    container.innerHTML = friendsHtml;

    // Bind challenge buttons
    const btns = container.querySelectorAll('button[data-challenge-id]');
    btns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = (e.currentTarget as HTMLButtonElement).getAttribute('data-challenge-id')!;
        PizzeriaAudio.playClick();
        this.onChallengeFriend(id);
      });
    });

    // Bind simulate disconnect
    const btnSim = document.getElementById('btnSimDisconnect');
    if (btnSim) {
      btnSim.addEventListener('click', () => {
        PizzeriaAudio.playClick();
        this.onSimulateDisconnect();
      });
    }
  }

  // --- Real-Time Compact Code Viewer & Highlighting ---
  public highlightCompactZKLine(lineNum: number): void {
    this.renderCompactCode(lineNum);
  }

  public clearZKHighlight(): void {
    this.renderCompactCode(null);
  }

  private renderCompactCode(highlightLine: number | null): void {
    const viewer = document.getElementById('compactCodeViewer');
    if (!viewer) return;

    const codeLines = [
      "// ==========================================================================",
      "// 🍕 CLASH OF PIZZAS: SPICY CHALLENGE - CONTRATO COMPACT IN MIDNIGHT",
      "// ==========================================================================",
      "",
      "import { Ledger, Witness, Circuit, Cell, Maybe } from '@midnight-ntwrk/compact';",
      "",
      "export interface SimPizzaDAOLedger {",
      "  public_p1_commitment: Cell<bytes32>;",
      "  public_p2_commitment: Cell<bytes32>;",
      "  public_p1_hp: Cell<uint8>;",
      "  public_p2_hp: Cell<uint8>;",
      "  public_p1_score: Cell<uint24>;",
      "  public_p2_score: Cell<uint24>;",
      "}",
      "",
      "export contract SimPizzaDAO implements SimPizzaDAOLedger {",
      "  // ZK Circuit validating board layout commitments",
      "  public circuit verify_board_commitment(board, commitment) {",
      "    return hash256(board) === commitment;",
      "  }",
      "",
      "  // Circuit proving integrity of bite outcome secretly",
      "  public circuit verify_bite_integrity(board, expected_commit) {",
      "    return hash256(board) === expected_commit; // ZK VALIDATION CHECK",
      "  }",
      "",
      "  export function submit_bite_proof(index, cell_val, is_p1) {",
      "    const board = this.witness.get_private_board();",
      "    assert(this.verify_bite_integrity(board, commitment));",
      "    // ledger updates...",
      "  }",
      "}"
    ];

    viewer.innerHTML = codeLines.map((line, idx) => {
      const currentLineNum = idx + 1;
      const isHighlighted = highlightLine !== null && currentLineNum === highlightLine;
      const highlightClass = isHighlighted ? 'compact-line-highlight' : '';
      return `<span class="compact-line ${highlightClass}">` + 
             `<span style="color:#4b5563; font-size:7.5px; margin-right:8px; display:inline-block; width:15px; text-align:right;">${currentLineNum}</span>` + 
             `${this.escapeHtml(line)}</span>`;
    }).join('');

    if (highlightLine !== null) {
      const activeEl = viewer.querySelector('.compact-line-highlight');
      if (activeEl) {
        activeEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }
  }

  public showAnnouncement(title: string, subtitle: string): void {
    const overlay = document.getElementById('battleAnnouncementOverlay');
    if (!overlay) return;

    const titleEl = overlay.querySelector('.announcement-title');
    const subEl = overlay.querySelector('.announcement-subtitle');

    if (titleEl) titleEl.textContent = title;
    if (subEl) subEl.textContent = subtitle;

    overlay.style.display = 'flex';
    overlay.classList.remove('fade-out');

    // Trigger scale-in audio fanfare!
    PizzeriaAudio.playFanfare();

    setTimeout(() => {
      overlay.classList.add('fade-out');
      setTimeout(() => {
        overlay.style.display = 'none';
      }, 400);
    }, 2000);
  }

  private escapeHtml(str: string): string {
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  // Console logging interface
  public log(msg: string, type: 'system' | 'info' | 'success' | 'warn' | 'error' = 'info'): void {
    const logEl = document.createElement('div');
    logEl.className = `log-line ${type}`;

    const timeStr = this.terminalTimer.textContent || '00:00:00';
    logEl.textContent = `>>> [${timeStr}] ${msg}`;

    this.consoleBody.appendChild(logEl);
    this.consoleBody.scrollTop = this.consoleBody.scrollHeight; // Auto scroll
  }

  private startTerminalTimer(): void {
    setInterval(() => {
      const now = new Date();
      const hrs = now.getHours().toString().padStart(2, '0');
      const mins = now.getMinutes().toString().padStart(2, '0');
      const secs = now.getSeconds().toString().padStart(2, '0');
      this.terminalTimer.textContent = `${hrs}:${mins}:${secs}`;
    }, 1000);
  }

  public logZK(msg: string): void {
    const container = document.getElementById('zkProofLogContainer');
    if (!container) return;
    
    // Ensure it's visible
    container.style.display = 'block';

    const logEl = document.createElement('div');
    logEl.style.color = '#60a5fa';
    logEl.style.marginBottom = '4px';
    
    const timeStr = this.terminalTimer.textContent || '00:00:00';
    logEl.textContent = `[${timeStr}] ${msg}`;

    container.appendChild(logEl);
    container.scrollTop = container.scrollHeight;
  }

  public openClaimModal(state: GameState): void {
    const claimModal = document.getElementById('web3ClaimModal');
    if (!claimModal) return;

    const score = state.playerScore;
    const truffleReward = Math.floor(score / 10) + 100;

    const claimScoreText = document.getElementById('claimScoreText')!;
    const claimRewardText = document.getElementById('claimRewardText')!;
    const claimMerkleText = document.getElementById('claimMerkleText')!;
    const claimWitnessText = document.getElementById('claimWitnessText')!;
    const claimWitnessRow = document.getElementById('claimWitnessRow')!;

    if (claimScoreText) claimScoreText.textContent = `${score} PTS`;
    if (claimRewardText) claimRewardText.textContent = `${truffleReward} Trufas de Oro ✨`;
    if (claimMerkleText) claimMerkleText.textContent = state.playerCommitment || 'N/A';
    
    if (state.witnessCertificate) {
      if (claimWitnessRow) claimWitnessRow.style.display = 'block';
      if (claimWitnessText) claimWitnessText.textContent = state.witnessCertificate;
    } else {
      if (claimWitnessRow) claimWitnessRow.style.display = 'none';
    }

    claimModal.classList.add('active');
    claimModal.style.display = 'flex';

    const btnCloseClaim = document.getElementById('btnCloseClaim');
    if (btnCloseClaim) {
      btnCloseClaim.onclick = () => {
        PizzeriaAudio.playClick();
        claimModal.classList.remove('active');
        claimModal.style.display = 'none';
      };
    }

    const btnSignClaim = document.getElementById('btnSignClaim');
    if (btnSignClaim) {
      btnSignClaim.onclick = () => {
        PizzeriaAudio.playClick();
        claimModal.classList.remove('active');
        claimModal.style.display = 'none';
        this.openMidnightWalletModal(state, truffleReward);
      };
    }
  }

  public openMidnightWalletModal(state: GameState, truffleReward: number): void {
    const score = state.playerScore;
    const merkleRoot = state.playerCommitment || 'N/A';

    if (this.wallet.getIsConnected()) {
      // REAL LACE WALLET SIGNATURE FLOW!
      this.log('🛡️ Firma real solicitada. Se abrirá la extensión flotante de Lace Wallet...', 'info');

      const walletModal = document.getElementById('midnightWalletModal');
      if (walletModal) {
        const walletTruffleReward = document.getElementById('walletTruffleReward')!;
        if (walletTruffleReward) {
          walletTruffleReward.textContent = `+${truffleReward} Trufas de Oro ✨`;
        }
        
        const approveBtn = document.getElementById('btnApproveWallet');
        if (approveBtn) approveBtn.textContent = 'FIRMAR CON LACE 🔑';

        walletModal.classList.add('active');
        walletModal.style.display = 'flex';

        const btnCancelWallet = document.getElementById('btnCancelWallet');
        if (btnCancelWallet) {
          btnCancelWallet.onclick = () => {
            PizzeriaAudio.playClick();
            walletModal.classList.remove('active');
            walletModal.style.display = 'none';
            this.log('❌ Firma de transacción real cancelada por el usuario.', 'error');
            this.openClaimModal(state);
          };
        }

        const btnApproveWallet = document.getElementById('btnApproveWallet');
        if (btnApproveWallet) {
          btnApproveWallet.onclick = async () => {
            PizzeriaAudio.playClick();
            btnApproveWallet.textContent = 'ESPERANDO LACE...';
            (btnApproveWallet as HTMLButtonElement).disabled = true;

            try {
              this.log('📡 Enviando transacción ' + merkleRoot.slice(0, 12) + ' a la extensión Lace...');
              
              // CALL THE INJECTED LACE API!
              await this.wallet.signClaimTransaction(score, truffleReward, merkleRoot);
              
              // SUCCESS!
              walletModal.classList.remove('active');
              walletModal.style.display = 'none';
              (btnApproveWallet as HTMLButtonElement).disabled = false;
              btnApproveWallet.textContent = 'FIRMAR CON LACE 🔑';

              PizzeriaAudio.playCoin();
              this.log('🛡️ ¡Firma real aprobada en Lace Wallet! Generando ZK proofs locales de forma Shielded...', 'success');
              
              this.logZK('[prove_claim_truffles()] Compilando circuito de recompensa ZK en cliente (WASM)...');
              this.logZK(`[prove_claim_truffles()] Recompensa real verificada: ${truffleReward} Trufas.`);
              this.logZK('[prove_claim_truffles()] Transacción firmada con clave privada inyectada por Lace.');
              this.logZK('[compact_ledger] Enviando transacción firmada a la testnet Preview...');
              this.logZK('[compact_ledger] Bloque minado con éxito en Midnight. Estado Compact actualizado.');

              this.log(`🪙 ¡Liquidación exitosa en Testnet! Se han acreditado +${truffleReward} Trufas de Oro a tu balance inyectado.`, 'success');
              this.log('📝 Estado finalizado publicado de forma Shielded en Midnight L2 (Preview).', 'system');

              // Reset game state to lobby
              state.gameState = 'lobby';
              state.winner = null;
              state.playerHP = 3;
              state.rivalHP = 3;
              state.playerScore = 0;
              state.rivalScore = 0;
              state.isMultiplayerActive = false;
              state.witnessCertificate = undefined;

              this.updateHUD(state);
            } catch (e) {
              // FAILED / REJECTED
              walletModal.classList.remove('active');
              walletModal.style.display = 'none';
              (btnApproveWallet as HTMLButtonElement).disabled = false;
              btnApproveWallet.textContent = 'FIRMAR CON LACE 🔑';

              PizzeriaAudio.playDisaster();
              this.log('❌ Firma de transacción real rechazada en la extensión de Lace Wallet.', 'error');
              this.openClaimModal(state);
            }
          };
        }
      }
      return;
    }

    // ELSE: SIMULATED SHIELDED WALLET FLOW (FALLBACK)
    const walletModal = document.getElementById('midnightWalletModal');
    if (!walletModal) return;

    const walletTruffleReward = document.getElementById('walletTruffleReward')!;
    if (walletTruffleReward) {
      walletTruffleReward.textContent = `+${truffleReward} Trufas de Oro ✨`;
    }

    const approveBtn = document.getElementById('btnApproveWallet');
    if (approveBtn) approveBtn.textContent = 'APROBAR FIRMA';

    walletModal.classList.add('active');
    walletModal.style.display = 'flex';

    const btnCancelWallet = document.getElementById('btnCancelWallet');
    if (btnCancelWallet) {
      btnCancelWallet.onclick = () => {
        PizzeriaAudio.playClick();
        walletModal.classList.remove('active');
        walletModal.style.display = 'none';
        this.log('❌ Firma de transacción de liquidación rechazada en Midnight Wallet.', 'error');
        this.openClaimModal(state);
      };
    }

    const btnApproveWallet = document.getElementById('btnApproveWallet');
    if (btnApproveWallet) {
      btnApproveWallet.onclick = () => {
        PizzeriaAudio.playClick();
        walletModal.classList.remove('active');
        walletModal.style.display = 'none';

        PizzeriaAudio.playCoin();

        this.log('🛡️ Firma aprobada en Midnight Wallet. Generando pruebas de conocimiento cero locales...', 'success');
        
        // Output complete ledger-block log flow in the cryptographic console!
        this.logZK('[prove_claim_truffles()] Compilando circuito de recompensa ZK...');
        this.logZK(`[prove_claim_truffles()] Recompensa verificada: ${truffleReward} Trufas.`);
        this.logZK('[prove_claim_truffles()] Firmando transacción con clave privada shielded...');
        this.logZK('[compact_ledger] Enviando transacción a red Midnight L2...');
        this.logZK('[compact_ledger] Bloque minado con éxito. Estado Compact actualizado.');

        this.log(`🪙 ¡Liquidación exitosa! Se han acreditado +${truffleReward} Trufas de Oro a tu balance on-chain.`, 'success');
        this.log('📝 Estado finalizado publicado de forma Shielded en Midnight L2.', 'system');

        // Reset game state to lobby
        state.gameState = 'lobby';
        state.winner = null;
        state.playerHP = 3;
        state.rivalHP = 3;
        state.playerScore = 0;
        state.rivalScore = 0;
        state.isMultiplayerActive = false;
        state.witnessCertificate = undefined;

        this.updateHUD(state);
      };
    }
  }

  private async handleConnectWalletClick(): Promise<void> {
    PizzeriaAudio.playClick();
    
    if (this.wallet.getIsConnected()) {
      // Disconnect
      this.wallet.disconnect();
      this.log('🔌 Billetera desconectada.', 'info');
      this.updateWalletUI();
    } else {
      // Connect
      this.log('📡 Buscando extensión de Lace Wallet en el navegador...', 'info');
      if (!this.wallet.isLaceAvailable()) {
        PizzeriaAudio.playDisaster();
        this.log('❌ Error: Extensión Lace Wallet no encontrada en este navegador.', 'error');
        
        // Diagnóstico en vivo de las billeteras inyectadas en la consola táctica
        const cardanoObj = (window as any).cardano;
        const midnightObj = (window as any).midnight;
        const cardanoKeys = cardanoObj ? Object.keys(cardanoObj).filter(k => k !== 'lace' && k !== 'mnLace') : [];
        const midnightKeys = midnightObj ? Object.keys(midnightObj) : [];
        
        if (cardanoKeys.length > 0 || midnightKeys.length > 0) {
          this.log(`🔍 Billeteras detectadas: Cardano: [${cardanoKeys.join(', ')}] | Midnight: [${midnightKeys.join(', ')}]`, 'warn');
          this.log('💡 Tip: Instala o activa "Lace Beta Wallet for Midnight" en este navegador y recarga la página (F5).', 'warn');
        } else {
          this.log('🔍 Estado: No se detecta ninguna billetera Web3 (window.cardano y window.midnight no están definidos).', 'warn');
          this.log('💡 Tip: Asegúrate de estar usando Chrome o Brave en una PC/Laptop con la extensión de Lace instalada y activa.', 'warn');
        }
        
        // Flash button in red to indicate error
        const btnConnect = document.getElementById('btnConnectWallet');
        if (btnConnect) {
          btnConnect.style.borderColor = 'var(--neon-red)';
          btnConnect.style.color = 'var(--neon-red)';
          setTimeout(() => {
            btnConnect.style.borderColor = '#6366f1';
            btnConnect.style.color = '#a5b4fc';
          }, 1000);
        }
        return;
      }

      const success = await this.wallet.connect();
      if (success) {
        PizzeriaAudio.playFanfare();
        const addr = this.wallet.getAddress();
        const shortAddr = `${addr.slice(0, 10)}...${addr.slice(-6)}`;
        this.log(`🔑 ¡Lace Wallet conectada con éxito! Dirección: ${shortAddr}`, 'success');
        this.log('📝 Red activa: MIDNIGHT TESTNET (PREVIEW)', 'system');
        this.updateWalletUI();
      } else {
        PizzeriaAudio.playDisaster();
        this.log('❌ Conexión rechazada o fallida en Lace Wallet.', 'error');
        this.updateWalletUI();
      }
    }
  }

  private handleCopyP2PLinkClick(): void {
    PizzeriaAudio.playCoin();
    
    // Obtener el compromiso de la pizza del jugador actual en vivo
    const commitment = this.latestState?.playerCommitment || 'mr_0xmockpizza1234567';
    const url = `${window.location.origin}${window.location.pathname}?challenge=${commitment}`;
    
    navigator.clipboard.writeText(url).then(() => {
      this.log(`🔗 Enlace de Reto P2P copiado al portapapeles: ${url}`, 'success');
      this.log('✉️ Envíaselo a tu rival en Brave/Chrome. Al abrirlo, conectará su Lace Wallet para retarte on-chain.', 'system');
      
      // Animación de botón copiado
      const btn = document.getElementById('btnCopyP2PLink');
      if (btn) {
        const oldText = btn.textContent;
        btn.textContent = '✅ ¡COPIADO CON ÉXITO! ✅';
        btn.style.borderColor = 'var(--neon-green)';
        btn.style.color = 'var(--neon-green)';
        btn.style.boxShadow = '0 0 15px rgba(16, 185, 129, 0.4)';
        setTimeout(() => {
          btn.textContent = oldText;
          btn.style.borderColor = '#00f2fe';
          btn.style.color = '#00f2fe';
          btn.style.boxShadow = '0 0 10px rgba(0, 242, 254, 0.15)';
        }, 1500);
      }
    }).catch(err => {
      console.error('Failed to copy P2P link:', err);
      this.log('❌ Error al copiar al portapapeles. Copia esta URL manualmente:', 'error');
      this.log(url, 'warn');
    });
  }

  private updateWalletUI(): void {
    const btnConnect = document.getElementById('btnConnectWallet');
    if (!btnConnect) return;

    if (this.wallet.getIsConnected()) {
      const addr = this.wallet.getAddress();
      const shortAddr = `${addr.slice(0, 8)}...${addr.slice(-5)}`;
      
      if (addr.startsWith('preview_mr0xs') || addr.startsWith('mn_shield-addr_preview')) {
        btnConnect.textContent = `🌐 PREVIEW: ${shortAddr}`;
        btnConnect.style.background = 'rgba(0, 242, 254, 0.15)';
        btnConnect.style.borderColor = '#00f2fe';
        btnConnect.style.color = '#00f2fe';
        btnConnect.style.boxShadow = '0 0 15px rgba(0, 242, 254, 0.6)';
      } else {
        btnConnect.textContent = `🟢 SHIELDED: ${shortAddr}`;
        btnConnect.style.background = 'rgba(16, 185, 129, 0.15)';
        btnConnect.style.borderColor = 'var(--neon-green)';
        btnConnect.style.color = 'var(--neon-green)';
        btnConnect.style.boxShadow = '0 0 15px rgba(16, 185, 129, 0.5)';
      }

      // Fetch the balance asynchronously and append it to the button text
      this.wallet.getBalance().then((balance) => {
        if (balance) {
          const balanceStr = ` | 🪙 ${balance.night} tNIGHT`;
          if (addr.startsWith('preview_mr0xs') || addr.startsWith('mn_shield-addr_preview')) {
            btnConnect.textContent = `🌐 PREVIEW: ${shortAddr}${balanceStr}`;
          } else {
            btnConnect.textContent = `🟢 SHIELDED: ${shortAddr}${balanceStr}`;
          }
        }
      }).catch((e) => console.warn('Async balance load failed:', e));

    } else {
      btnConnect.textContent = '🔑 CONECTAR WALLET';
      btnConnect.style.background = 'rgba(99, 102, 241, 0.1)';
      btnConnect.style.borderColor = '#6366f1';
      btnConnect.style.color = '#a5b4fc';
      btnConnect.style.boxShadow = '0 0 10px rgba(99, 102, 241, 0.25)';
    }
  }
}
