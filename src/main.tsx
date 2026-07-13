import React, { Component, ErrorInfo, ReactNode } from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { PrivyProvider } from '@privy-io/react-auth';
import './style.css';

// Error Boundary global — evita pantalla blanca ante cualquier crash
class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  constructor(props: any) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary] Error capturado:', error, info);
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: '40px', fontFamily: 'monospace', background: '#1a0a00', color: '#ff6b35', minHeight: '100vh' }}>
          <h1 style={{ color: '#ffd866' }}>🍕 Error al cargar Spicy Challenge</h1>
          <p style={{ marginTop: '12px', color: '#ff9966' }}>{this.state.error.message}</p>
          <pre style={{ marginTop: '16px', fontSize: '11px', color: '#aaa', whiteSpace: 'pre-wrap' }}>
            {this.state.error.stack}
          </pre>
          <button
            onClick={() => window.location.reload()}
            style={{ marginTop: '20px', padding: '10px 20px', background: '#ff6b35', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '14px' }}
          >
            🔄 Recargar
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const privyAppId = (import.meta as any).env?.VITE_PRIVY_APP_ID || 'cmqdk627p00na0cjsi6ioszjx';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <PrivyProvider
        appId={privyAppId}
        config={{
          loginMethods: ['email', 'google', 'passkey'],
          appearance: {
            theme: 'dark',
            accentColor: '#ffd866',
            showWalletLoginFirst: false,
            walletList: [],
          },
          embeddedWallets: {
            ethereum: {
              createOnLogin: 'off',
            },
            showWalletUIs: false,
          }
        }}
      >
        <App />
      </PrivyProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
