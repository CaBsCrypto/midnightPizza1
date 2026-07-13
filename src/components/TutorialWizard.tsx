import React, { useState } from 'react';

interface TutorialWizardProps {
  onClose: () => void;
}

export const TutorialWizard: React.FC<TutorialWizardProps> = ({ onClose }) => {
  const [step, setStep] = useState(0);

  const steps = [
    {
      title: "🍕 ¿Qué es Spicy Challenge?",
      content: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <p>
            Es un juego táctico multijugador 6x6. Tu misión es **devorar las pizzas secretas del oponente** antes de que él coma las tuyas, evitando morder los chiles trampa picantes.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '5px' }}>
            <div style={{ background: 'rgba(232, 132, 90, 0.05)', border: '1px solid rgba(232, 132, 90, 0.15)', padding: '10px', borderRadius: '10px' }}>
              <span style={{ fontSize: '16px' }}>🛡️ Izquierda</span>
              <strong style={{ display: 'block', fontSize: '11px', color: 'var(--neon-orange)', margin: '3px 0' }}>Tu Tablero Secreto</strong>
              <span style={{ fontSize: '10px', opacity: 0.8 }}>Esconde tus pizzas, curas (+HP) y chiles trampa (-HP).</span>
            </div>
            <div style={{ background: 'rgba(232, 132, 90, 0.05)', border: '1px solid rgba(232, 132, 90, 0.15)', padding: '10px', borderRadius: '10px' }}>
              <span style={{ fontSize: '16px' }}>🎯 Derecha</span>
              <strong style={{ display: 'block', fontSize: '11px', color: 'var(--neon-orange)', margin: '3px 0' }}>Tablero del Rival</strong>
              <span style={{ fontSize: '10px', opacity: 0.8 }}>¡Haz clic en sus campanas plateadas para atacar en tu turno!</span>
            </div>
          </div>
        </div>
      )
    },
    {
      title: "🔑 Identidad Web3 con Privy",
      content: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <p>
            Para asegurar un juego justo, sin trampas y con recompensas reales, necesitas una billetera Stellar:
          </p>
          <ul style={{ paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <li>💡 <strong>Acceso Social (Recomendado):</strong> Inicia sesión con Google o Email. Privy creará tu billetera Stellar en segundo plano automáticamente.</li>
            <li>🔌 <strong>Wallets Oficiales:</strong> Conecta Freighter, Albedo, LOBSTR o Ledger mediante el *Stellar Wallets Kit*.</li>
          </ul>
        </div>
      )
    },
    {
      title: "⚙️ Auditoría On-Chain & Soroban",
      content: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <p>
            ¿Cómo aseguramos que nadie espíe el tablero del otro?
          </p>
          <ol style={{ paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <li>🔒 <strong>Commit:</strong> Al comenzar, se registra un hash inmutable de tu tablero en la blockchain de Stellar Soroban.</li>
            <li>🔓 <strong>Reveal:</strong> Al final, el ganador revela su tablero para validar todas las jugadas y reclamar **Trufas de Oro (tokens SEP-41)** directo a su wallet.</li>
          </ol>
        </div>
      )
    }
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '340px' }}>
      <div className="modal-header" style={{ 
        borderBottom: '1px solid rgba(195, 122, 103, 0.2)', 
        padding: '15px 25px', 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center' 
      }}>
        <h2 style={{ fontFamily: 'Orbitron', color: 'var(--neon-red)', fontWeight: 900, fontSize: '15px', margin: 0 }}>
          {steps[step].title}
        </h2>
        <button 
          className="modal-close-btn" 
          onClick={onClose} 
          style={{ color: 'var(--neon-red)', fontSize: '24px', cursor: 'pointer', background: 'none', border: 'none', outline: 'none' }}
        >
          ×
        </button>
      </div>

      <div className="modal-body" style={{ 
        textAlign: 'left', 
        flex: 1, 
        padding: '25px', 
        fontSize: '12px', 
        color: 'var(--text-dark)', 
        lineHeight: '1.6' 
      }}>
        {steps[step].content}
      </div>

      {/* Selector de Pasos */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        padding: '15px 25px', 
        borderTop: '1px solid rgba(195, 122, 103, 0.1)' 
      }}>
        <div style={{ display: 'flex', gap: '6px' }}>
          {steps.map((_, i) => (
            <div 
              key={i} 
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: i === step ? 'var(--neon-red)' : 'rgba(195, 122, 103, 0.2)',
                transition: 'all 0.3s'
              }}
            />
          ))}
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          {step > 0 && (
            <button
              onClick={() => setStep(step - 1)}
              style={{
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(195, 122, 103, 0.3)',
                color: 'var(--text-dark)',
                padding: '8px 16px',
                borderRadius: '8px',
                cursor: 'pointer',
                fontFamily: 'Outfit',
                fontWeight: 'bold',
                fontSize: '11px'
              }}
            >
              Atrás
            </button>
          )}

          {step < steps.length - 1 ? (
            <button
              onClick={() => setStep(step + 1)}
              style={{
                background: 'linear-gradient(90deg, var(--neon-red), var(--neon-orange))',
                border: 'none',
                color: '#0f0b08',
                padding: '8px 16px',
                borderRadius: '8px',
                cursor: 'pointer',
                fontFamily: 'Outfit',
                fontWeight: 'bold',
                fontSize: '11px'
              }}
            >
              Siguiente
            </button>
          ) : (
            <button
              onClick={onClose}
              style={{
                background: 'linear-gradient(90deg, var(--neon-red), var(--neon-orange))',
                border: 'none',
                color: '#0f0b08',
                padding: '8px 24px',
                borderRadius: '8px',
                cursor: 'pointer',
                fontFamily: 'Outfit',
                fontWeight: 'bold',
                fontSize: '11px',
                boxShadow: '0 0 10px rgba(232, 132, 90, 0.3)'
              }}
            >
              ¡A Jugar! ⚔️
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
