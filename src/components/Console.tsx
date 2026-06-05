import React, { useEffect, useState, useRef } from 'react';

export interface LogLine {
  text: string;
  type: 'system' | 'info' | 'success' | 'error' | 'warn';
  timestamp: string;
}

interface ConsoleProps {
  logs: LogLine[];
}

export const Console: React.FC<ConsoleProps> = ({ logs }) => {
  const [timeStr, setTimeStr] = useState('00:00:00');
  const consoleBodyRef = useRef<HTMLDivElement>(null);

  // Actualizar el reloj interno de la consola criptográfica
  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      const hrs = now.getHours().toString().padStart(2, '0');
      const mins = now.getMinutes().toString().padStart(2, '0');
      const secs = now.getSeconds().toString().padStart(2, '0');
      setTimeStr(`${hrs}:${mins}:${secs}`);
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  // Auto-scroll al final del log al recibir nuevos elementos
  useEffect(() => {
    if (consoleBodyRef.current) {
      consoleBodyRef.current.scrollTop = consoleBodyRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <footer className="bottom-terminal" style={{ marginTop: '15px' }}>
      <div className="terminal-header">
        <span className="terminal-dot red" style={{ background: '#ef4444' }}></span>
        <span className="terminal-dot yellow" style={{ background: '#eab308' }}></span>
        <span className="terminal-dot green" style={{ background: '#22c55e' }}></span>
        <span className="terminal-title" style={{ fontFamily: 'Orbitron', fontWeight: 700, fontSize: '11px', letterSpacing: '0.5px' }}>
          CONSOLA CRIPTOGRÁFICA DE MIDNIGHT LEDGER
        </span>
        <span className="terminal-timer" id="terminalTimer" style={{ fontFamily: 'Orbitron' }}>
          {timeStr}
        </span>
      </div>
      <div 
        className="terminal-body" 
        id="consoleBody" 
        ref={consoleBodyRef}
        style={{ 
          maxHeight: '160px', 
          overflowY: 'auto', 
          fontFamily: 'monospace', 
          fontSize: '11px',
          textAlign: 'left'
        }}
      >
        {logs.map((log, index) => (
          <div key={index} className={`log-line ${log.type}`}>
            <span style={{ color: '#475569', marginRight: '8px' }}>[{log.timestamp}]</span>
            &gt;&gt;&gt; {log.text}
          </div>
        ))}
        {logs.length === 0 && (
          <div className="log-line system">&gt;&gt;&gt; Inicializando consola reactiva...</div>
        )}
      </div>
    </footer>
  );
};
