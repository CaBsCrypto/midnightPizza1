import { useState, useCallback } from 'react';
import { StellarPasskeysMock } from '../stellar_passkeys';

export function useStellarWallet() {
  const [isConnected, setIsConnected] = useState(false);
  const [stellarAddress, setStellarAddress] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const connectStellar = useCallback(async (username: string) => {
    setIsLoading(true);
    try {
      // Registrar/conectar utilizando Stellar Passkeys
      const result = await StellarPasskeysMock.register(username);
      if (result.success) {
        setStellarAddress(result.stellarAddress);
        setIsConnected(true);
        return true;
      }
      return false;
    } catch (err) {
      console.error('Error al conectar con Stellar Passkeys:', err);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const disconnectStellar = useCallback(() => {
    setStellarAddress('');
    setIsConnected(false);
  }, []);

  return {
    isConnected,
    stellarAddress,
    isLoading,
    connectStellar,
    disconnectStellar
  };
}
