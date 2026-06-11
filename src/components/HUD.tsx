import React from 'react';

interface HUDProps {
  chefScore: number;
  gasFee: string;
  isWalletConnected: boolean;
  walletAddress: string;
  onConnectWallet: () => void;
  onDisconnectWallet: () => void;
  onOpenRules: () => void;
  playerHP: number;
  rivalHP: number;
  rivalName?: string;
  // Stellar integration props
  isStellarConnected: boolean;
  stellarAddress: string;
  walletType?: string | null;
  onConnectStellar: (type: any, username?: string) => void;
  onDisconnectStellar: () => void;
}

export const HUD: React.FC<HUDProps> = ({
  chefScore,
  gasFee,
  isWalletConnected,
  walletAddress,
  onConnectWallet,
  onDisconnectWallet,
  onOpenRules,
  playerHP,
  rivalHP,
  rivalName = 'Rival Chef',
  isStellarConnected,
  stellarAddress,
  walletType,
  onConnectStellar,
  onDisconnectStellar
}) => {
  // Render de vidas de corazones pixel art cyberpunk
  const renderHearts = (hp: number) => {
    const hearts = [];
    for (let i = 0; i < 5; i++) {
      if (i < hp) {
        hearts.push(
          <span key={i} className="heart-icon active" style={{ textShadow: '0 0 10px #ef4444' }}>
            ❤️
          </span>
        );
      } else {
        hearts.push(
          <span key={i} className="heart-icon broken" style={{ opacity: 0.35 }}>
            🖤
          </span>
        );
      }
    }
    return hearts;
  };

  // Formatear dirección abreviada
  const formatAddress = (addr: string) => {
    if (!addr) return '';
    if (addr.length < 15) return addr;
    return `${addr.substring(0, 10)}...${addr.substring(addr.length - 6)}`;
  };

  return (
    <header className="top-hud" style={{ borderBottom: '2px solid rgba(251, 191, 36, 0.2)' }}>
      {/* HUD Brand */}
      <div className="hud-brand">
        <span className="hud-emoji" style={{ fontSize: '28px', filter: 'drop-shadow(0 0 8px #ef4444)' }}>🍕</span>
        <div className="hud-title-block">
          <h1 style={{ fontFamily: 'Orbitron', fontWeight: 900, letterSpacing: '1px' }}>CLASH OF PIZZAS</h1>
          <span className="hud-subtitle">Spicy Challenge • Stellar Soroban & ZK Arena</span>
        </div>
        
        <button 
          className="console-btn" 
          onClick={onOpenRules}
          style={{ 
            marginLeft: '20px', 
            padding: '6px 14px', 
            fontSize: '10px', 
            background: 'rgba(251, 191, 36, 0.1)', 
            border: '2px solid var(--neon-gold)', 
            color: 'var(--neon-gold)', 
            fontFamily: 'Orbitron', 
            cursor: 'pointer', 
            borderRadius: '8px', 
            fontWeight: 800,
            animation: 'pulseAlert 2.5s infinite' 
          }}
        >
          💡 REGLAS
        </button>

        {isStellarConnected ? (
          <button 
            className="console-btn" 
            onClick={onDisconnectStellar}
            style={{ 
              marginLeft: '10px', 
              padding: '6px 14px', 
              fontSize: '10px', 
              background: 'rgba(16, 185, 129, 0.1)', 
              border: '2px solid var(--neon-green)', 
              color: '#a7f3d0', 
              fontFamily: 'Orbitron', 
              cursor: 'pointer', 
              borderRadius: '8px', 
              fontWeight: 800, 
              width: 'auto',
              boxShadow: '0 0 10px rgba(16, 185, 129, 0.25)'
            }}
          >
            🚀 {walletType ? walletType.toUpperCase() : 'STELLAR'}: {formatAddress(stellarAddress)} [DESCONECTAR]
          </button>
        ) : (
          <select
            className="console-btn"
            onChange={(e) => {
              const val = e.target.value;
              if (val === 'passkey') {
                const username = prompt('Ingresa tu nombre de Chef para registrar tu Stellar Passkey:');
                if (username) onConnectStellar('passkey', username);
              } else if (val === 'freighter') {
                onConnectStellar('freighter');
              } else if (val === 'albedo') {
                onConnectStellar('albedo');
              } else if (val === 'google') {
                onConnectStellar('google');
              }
              // Reset
              e.target.value = '';
            }}
            defaultValue=""
            style={{ 
              marginLeft: '10px', 
              padding: '6px 14px', 
              fontSize: '10px', 
              background: 'rgba(59, 130, 246, 0.1)', 
              border: '2px solid #3b82f6', 
              color: '#93c5fd', 
              fontFamily: 'Orbitron', 
              cursor: 'pointer', 
              borderRadius: '8px', 
              fontWeight: 800, 
              width: 'auto',
              boxShadow: '0 0 10px rgba(59, 130, 246, 0.25)',
              outline: 'none'
            }}
          >
            <option value="" disabled>🚀 CONECTAR STELLAR</option>
            <option value="passkey" style={{ background: '#0f172a', color: '#fff' }}>🔑 STELLAR PASSKEYS</option>
            <option value="freighter" style={{ background: '#0f172a', color: '#fff' }}>📦 FREIGHTER WALLET</option>
            <option value="albedo" style={{ background: '#0f172a', color: '#fff' }}>🌌 ALBEDO SIGNER</option>
            <option value="google" style={{ background: '#0f172a', color: '#fff' }}>📧 GOOGLE / GMAIL (PRIVY)</option>
          </select>
        )}
      </div>

      {/* Vidas HUD integrado de forma premium */}
      <div className="hud-lives-panel" style={{ display: 'flex', gap: '20px', alignItems: 'center', margin: '0 20px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
          <span style={{ fontSize: '9px', color: '#94a3b8', fontFamily: 'Orbitron' }}>MIS VIDAS</span>
          <div className="heart-lives-row">{renderHearts(playerHP)}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
          <span style={{ fontSize: '9px', color: '#94a3b8', fontFamily: 'Orbitron' }}>{rivalName.toUpperCase()}</span>
          <div className="heart-lives-row">{renderHearts(rivalHP)}</div>
        </div>
      </div>

      {/* Metrics Panel */}
      <div className="hud-metrics">
        <div className="metric-card">
          <span className="metric-label">CHEF SCORE</span>
          <div className="metric-value-container">
            <span className="metric-value" id="chefScoreText">{chefScore.toLocaleString()}</span>
            <span className="metric-unit">PTS</span>
          </div>
        </div>
        <div className="metric-card">
          <span className="metric-label">GAS FEE</span>
          <div className="metric-value-container">
            <span className="metric-value">{gasFee}</span>
            <span className="metric-unit">XLM</span>
          </div>
        </div>
        <div className="metric-card">
          <span className="metric-label">ZK PRIVACY</span>
          <div className="metric-value-container">
            <span className="metric-value" style={{ color: 'var(--neon-green)', textShadow: '0 0 5px var(--neon-green)' }}>
              {isStellarConnected && stellarAddress ? `SHIELDED: ${formatAddress(stellarAddress)}` : 'SHIELDED'}
            </span>
          </div>
        </div>
      </div>

      <div className="hud-global-status" style={{ fontSize: '11px', fontFamily: 'var(--font-orbitron)', color: '#64748b' }}>
        NETWORK: <span style={{ color: 'var(--neon-green)', fontWeight: 'bold' }}>STELLAR_TESTNET Soroban (12ms)</span>
      </div>
    </header>
  );
};
