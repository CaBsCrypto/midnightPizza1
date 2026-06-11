import { useState, useCallback } from 'react';
import { StellarPasskeysMock } from '../stellar_passkeys';

export type StellarProviderType = 'passkey' | 'freighter' | 'albedo' | 'google';

export function useStellarWallet() {
  const [isConnected, setIsConnected] = useState(false);
  const [stellarAddress, setStellarAddress] = useState('');
  const [walletType, setWalletType] = useState<StellarProviderType | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const connectStellar = useCallback(async (type: StellarProviderType, username?: string) => {
    setIsLoading(true);
    try {
      if (type === 'passkey') {
        const result = await StellarPasskeysMock.register(username || 'Chef_Soroban');
        if (result.success) {
          setStellarAddress(result.stellarAddress);
          setWalletType('passkey');
          setIsConnected(true);
          return true;
        }
      } else if (type === 'freighter') {
        // Simular conexión del bridge de extensión Freighter
        await new Promise(resolve => setTimeout(resolve, 800));
        const mockAddress = `GD${Math.random().toString(36).substring(2, 12).toUpperCase().padEnd(54, 'F')}`;
        setStellarAddress(mockAddress);
        setWalletType('freighter');
        setIsConnected(true);
        return true;
      } else if (type === 'albedo') {
        // Simular firma delegada en Albedo
        await new Promise(resolve => setTimeout(resolve, 600));
        const mockAddress = `GB${Math.random().toString(36).substring(2, 12).toUpperCase().padEnd(54, 'A')}`;
        setStellarAddress(mockAddress);
        setWalletType('albedo');
        setIsConnected(true);
        return true;
      } else if (type === 'google') {
        // Simular embedded wallet OAuth (Google / Privy)
        await new Promise(resolve => setTimeout(resolve, 1500));
        const mockAddress = `GC${Math.random().toString(36).substring(2, 12).toUpperCase().padEnd(54, 'G')}`;
        setStellarAddress(mockAddress);
        setWalletType('google');
        setIsConnected(true);
        return true;
      }
      return false;
    } catch (err) {
      console.error('Error al conectar con Stellar:', err);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const disconnectStellar = useCallback(() => {
    setStellarAddress('');
    setWalletType(null);
    setIsConnected(false);
  }, []);

  return {
    isConnected,
    stellarAddress,
    walletType,
    isLoading,
    connectStellar,
    disconnectStellar
  };
}
