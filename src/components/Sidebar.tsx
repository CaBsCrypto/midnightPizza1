import React, { useState } from 'react';
import { Friend } from '../simulation';

interface SidebarProps {
  friends: Friend[];
  onAddFriend: (name: string) => void;
  onChallengeFriend: (id: string) => void;
  onCopyChallengeLink: () => void;
  merkleRoot: string;
  zkLogs: string[];
}

export const Sidebar: React.FC<SidebarProps> = ({
  friends,
  onAddFriend,
  onChallengeFriend,
  onCopyChallengeLink,
  merkleRoot,
  zkLogs
}) => {
  const [activeTab, setActiveTab] = useState<'social' | 'zk'>('social');
  const [friendNameInput, setFriendNameInput] = useState('');

  const handleAddFriendClick = () => {
    if (friendNameInput.trim()) {
      onAddFriend(friendNameInput.trim());
      setFriendNameInput('');
    }
  };

  // Código Compact de Midnight ZK en tiempo real para visualizar on-chain
  const compactCodeSnippet = `// SimPizzaDAO Compact Smart Contract
circuit verify_bite_integrity(
  secret board: Field[6][6],
  public row: Field,
  public col: Field,
  public claimed_ingredient: Field
) {
  // 1. Validar coordenadas de grilla de 6x6
  assert(row >= 0 && row < 6);
  assert(col >= 0 && col < 6);
  
  // 2. Extraer ingrediente oculto
  let actual = board[row][col];
  
  // 3. Validar consistencia criptográfica
  assert(actual == claimed_ingredient);
  
  // 4. Retornar validez on-chain
  return;
}`;

  return (
    <aside className="sidebar-hud">
      <div className="sidebar-hud-overhauled" style={{ display: 'flex', flexDirection: 'column', gap: '15px', height: '100%' }}>
        
        {/* Navigation Tabs */}
        <div className="construction-tabs" style={{ display: 'flex', background: 'rgba(0,0,0,0.4)', padding: '3px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.06)' }}>
          <button 
            className={`tab-btn ${activeTab === 'social' ? 'active' : ''}`} 
            onClick={() => setActiveTab('social')} 
            style={{ flex: 1 }}
          >
            👥 SOCIAL
          </button>
          <button 
            className={`tab-btn ${activeTab === 'zk' ? 'active' : ''}`} 
            onClick={() => setActiveTab('zk')} 
            style={{ flex: 1 }}
          >
            🔐 LEDGER ZK
          </button>
        </div>

        {/* Tab Panel: SOCIAL */}
        {activeTab === 'social' && (
          <div id="panelAmigos" className="tab-panel active" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <h2 className="section-title">AMIGOS & DESAFÍOS</h2>
            <div className="midnight-console" style={{ padding: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', gap: '6px' }}>
                <input 
                  type="text" 
                  value={friendNameInput}
                  onChange={(e) => setFriendNameInput(e.target.value)}
                  placeholder="Nombre de chef..." 
                  style={{ 
                    background: 'rgba(0,0,0,0.5)', 
                    border: '1px solid rgba(255,255,255,0.08)', 
                    color: '#fff', 
                    padding: '6px 10px', 
                    borderRadius: '8px', 
                    flex: 1, 
                    fontSize: '11px' 
                  }}
                />
                <button 
                  className="console-btn" 
                  onClick={handleAddFriendClick}
                  style={{ padding: '6px 12px', fontSize: '10px', width: 'auto', borderRadius: '8px', boxShadow: 'none', margin: 0 }}
                >
                  AGREGAR
                </button>
              </div>
            </div>

            {/* List of Friends */}
            <div id="friendsListContainer" style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '250px', overflowY: 'auto', paddingRight: '4px' }}>
              {friends.map((friend) => (
                <div key={friend.id} className="friend-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.02)', padding: '8px 12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.04)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '16px' }}>{friend.emoji}</span>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                      <span style={{ fontWeight: 'bold', fontSize: '11px', color: '#fff' }}>{friend.name}</span>
                      <span style={{ fontSize: '9px', color: friend.status === 'En línea' ? '#10b981' : '#64748b' }}>
                        {friend.status === 'En línea' ? '🟢 En línea' : '🔴 Desconectado'}
                      </span>
                    </div>
                  </div>
                  <button 
                    className="challenge-btn" 
                    onClick={() => onChallengeFriend(friend.id)}
                    disabled={friend.status !== 'En línea'}
                    style={{ 
                      fontSize: '9px', 
                      padding: '4px 10px', 
                      background: friend.status === 'En línea' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(255,255,255,0.05)',
                      border: friend.status === 'En línea' ? '1px solid #ef4444' : '1px solid rgba(255,255,255,0.1)',
                      color: friend.status === 'En línea' ? '#ef4444' : '#64748b',
                      borderRadius: '6px',
                      cursor: friend.status === 'En línea' ? 'pointer' : 'not-allowed',
                      fontFamily: 'Orbitron'
                    }}
                  >
                    RETAR ⚔️
                  </button>
                </div>
              ))}
              {friends.length === 0 && (
                <div style={{ fontSize: '11px', color: '#64748b', textAlign: 'center', padding: '15px' }}>
                  No tienes amigos en tu radar local. ¡Agrega un chef rival arriba!
                </div>
              )}
            </div>

            <button 
              className="console-btn" 
              onClick={onCopyChallengeLink}
              style={{ 
                padding: '10px', 
                fontSize: '11px', 
                background: 'rgba(0, 242, 254, 0.1)', 
                border: '2px dashed #00f2fe', 
                color: '#00f2fe', 
                borderRadius: '8px', 
                fontWeight: 800, 
                cursor: 'pointer', 
                boxShadow: '0 0 10px rgba(0, 242, 254, 0.15)', 
                marginTop: '5px', 
                transition: 'all 0.3s ease' 
              }}
            >
              🔗 COPIAR ENLACE RETO P2P (ZK)
            </button>
          </div>
        )}

        {/* Tab Panel: LEDGER ZK */}
        {activeTab === 'zk' && (
          <div id="panelZK" className="tab-panel active" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <h2 className="section-title">CONTRATO COMPACT & AUDITOR</h2>
            <div className="midnight-console" style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div className="console-row" style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px' }}>
                <span>LEDGER BLOCKCHAIN:</span>
                <span className="status-badge status-green" style={{ boxShadow: 'none', padding: '2px 6px', fontSize: '9px', background: '#10b981', color: '#fff', borderRadius: '4px' }}>
                  SHIELDED BOARD
                </span>
              </div>
              <div className="console-row" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '3px', fontSize: '11px' }}>
                <span>BOARD RAÍZ COMMITMENT:</span>
                <span className="console-hash" id="merkleRoot" style={{ fontSize: '9px', wordBreak: 'break-all', fontFamily: 'monospace', color: 'var(--neon-gold)' }}>
                  {merkleRoot}
                </span>
              </div>

              {/* Compact Code Viewer Component */}
              <div className="proposal-title" style={{ color: 'var(--neon-gold)', fontSize: '10px', fontWeight: 'bold', fontFamily: 'Orbitron', marginTop: '5px', textAlign: 'left' }}>
                CÓDIGO COMPACT EN TIEMPO REAL
              </div>
              <div 
                id="compactCodeViewer" 
                style={{ 
                  fontFamily: 'monospace', 
                  fontSize: '8.5px', 
                  background: '#0c0603', 
                  padding: '8px', 
                  borderRadius: '8px', 
                  border: '1px solid rgba(255,255,255,0.06)', 
                  maxHeight: '180px', 
                  overflowY: 'auto', 
                  color: '#a8a29e', 
                  lineHeight: '1.4', 
                  textAlign: 'left' 
                }}
              >
                <pre style={{ margin: 0 }}>{compactCodeSnippet}</pre>
              </div>

              {zkLogs.length > 0 && (
                <div 
                  id="zkProofLogContainer" 
                  style={{ 
                    fontFamily: 'monospace', 
                    fontSize: '9px', 
                    color: '#60a5fa', 
                    background: '#0c0603', 
                    padding: '10px', 
                    borderRadius: '8px', 
                    maxHeight: '100px', 
                    overflowY: 'auto', 
                    border: '1px solid rgba(255,255,255,0.06)', 
                    lineHeight: '1.4',
                    textAlign: 'left'
                  }}
                >
                  {zkLogs.map((log, index) => (
                    <div key={index}>&gt; {log}</div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
};
