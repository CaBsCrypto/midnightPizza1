import React from 'react';

interface GameBoardProps {
  board: number[][];
  revealed: boolean[][];
  isPlayer: boolean;
  score: number;
  hasImmunity: boolean;
  selectedEditCell: { r: number; c: number } | null;
  selectedInventoryItem: number | null;
  onCellClick: (r: number, c: number) => void;
  onRotatePizza?: (r: number, c: number, clockwise: boolean) => void;
  onShuffleBoard?: () => void;
  showShuffleButton?: boolean;
}

export const GameBoard: React.FC<GameBoardProps> = ({
  board,
  revealed,
  isPlayer,
  score,
  hasImmunity,
  selectedEditCell,
  selectedInventoryItem,
  onCellClick,
  onRotatePizza,
  onShuffleBoard,
  showShuffleButton = false
}) => {
  // Manejar rotación por rueda del ratón
  const handleWheel = (e: React.WheelEvent, r: number, c: number) => {
    if (!isPlayer || !onRotatePizza) return;
    e.preventDefault();
    const isClockwise = e.deltaY > 0;
    onRotatePizza(r, c, isClockwise);
  };

  const getCellClassName = (r: number, c: number, val: number, isBitten: boolean) => {
    const isDark = (r + c) % 2 === 1;
    let classes = `grid-cell ${isDark ? 'dark-tile' : ''}`;

    if (isBitten) {
      if (val === 0) {
        classes += ' bitten-miss';
      } else if (val >= 7 && val <= 9) {
        classes += ' bitten-cure';
      } else {
        classes += ' bitten-hit';
      }
    }

    if (isPlayer && selectedEditCell) {
      const selVal = board[selectedEditCell.r][selectedEditCell.c];
      if (selVal >= 1 && selVal <= 4 && val === selVal) {
        classes += ' selected-for-move';
      }
    }

    // Estilos de pizza para tablero del jugador o revelado
    if (isPlayer || isBitten) {
      if (val === 1) classes += ' pizza-m';
      else if (val === 2) classes += ' pizza-p';
      else if (val === 3) classes += ' pizza-s';
      else if (val === 4) classes += ' pizza-g';
      else if (val === 5) classes += ' item-jalapeno';
      else if (val === 6) classes += ' item-habanero';
      else if (val === 7) classes += ' item-water';
      else if (val === 8) classes += ' item-milk';
      else if (val === 9) classes += ' item-crown';
    }

    return classes;
  };

  const renderCellBadge = (val: number) => {
    if (val === 1) return <span style={{ position: 'absolute', bottom: '1px', right: '3px', fontSize: '7.5px', fontWeight: 'bold', color: '#a8a29e', fontFamily: 'Orbitron' }}>M</span>;
    if (val === 2) return <span style={{ position: 'absolute', bottom: '1px', right: '3px', fontSize: '7.5px', fontWeight: 'bold', color: '#ef4444', fontFamily: 'Orbitron' }}>P</span>;
    if (val === 3) return <span style={{ position: 'absolute', bottom: '1px', right: '3px', fontSize: '7.5px', fontWeight: 'bold', color: '#10b981', fontFamily: 'Orbitron' }}>S</span>;
    if (val === 4) return <span style={{ position: 'absolute', bottom: '1px', right: '3px', fontSize: '7.5px', fontWeight: 'bold', color: '#fbbf24', fontFamily: 'Orbitron' }}>G</span>;
    return null;
  };

  return (
    <div className={`board-card ${isPlayer ? 'player-board' : 'rival-board'}`}>
      <div className="board-header">
        <div className="board-title-block" style={{ textAlign: 'left' }}>
          <h3>{isPlayer ? '🛡️ MI MESA SECRETA' : '⚔️ MESA DEL RIVAL'}</h3>
          <span className="board-subtitle">
            {isPlayer ? 'Tus pizzas y trampas activas' : '¡Muerde las campanas de plata!'}
          </span>
        </div>
      </div>

      <div className="grid-board">
        {board.map((rowArr, r) =>
          rowArr.map((val, c) => {
            const isBitten = revealed[r][c];
            return (
              <button
                key={`${r}-${c}`}
                className={getCellClassName(r, c, val, isBitten)}
                onClick={() => onCellClick(r, c)}
                onWheel={(e) => handleWheel(e, r, c)}
                style={{ position: 'relative' }}
              >
                {/* Si es del rival y no está mordido, dibujamos la campana plateada de esferas (dome) */}
                {!isPlayer && !isBitten ? (
                  <div className="cloche-container" data-r={r} data-c={c}></div>
                ) : (
                  <>
                    {(isPlayer || isBitten) && renderCellBadge(val)}
                  </>
                )}
              </button>
            );
          })
        )}
      </div>

      <div className="board-footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="score-badge" style={{ fontFamily: 'Orbitron', fontSize: '10px' }}>
          SCORE: <strong style={{ color: '#fff' }}>{score}</strong> PTS
        </span>
        
        {isPlayer && showShuffleButton && onShuffleBoard && (
          <button 
            className="console-btn" 
            onClick={onShuffleBoard}
            style={{ width: 'auto', margin: 0, padding: '4px 12px', fontSize: '9px', borderRadius: '6px', background: 'linear-gradient(180deg, var(--neon-gold), #b45309)' }}
          >
            🎲 MEZCLAR
          </button>
        )}

        {hasImmunity && (
          <span className="immunity-badge" style={{ display: 'inline-block', fontSize: '9px', padding: '2px 6px', background: '#3b82f6', color: '#fff', borderRadius: '4px' }}>
            🛡️ INMUNE
          </span>
        )}
      </div>
    </div>
  );
};
