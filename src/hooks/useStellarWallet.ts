import { useState, useCallback } from 'react';
import { StellarPasskeysMock } from '../stellar_passkeys';
import { isConnected as getFreighterStatus, getAddress as getFreighterAddress, requestAccess as requestFreighterAccess } from '@stellar/freighter-api';
import { StellarWalletsKit } from '@creit.tech/stellar-wallets-kit/sdk';
import { Networks } from '@creit.tech/stellar-wallets-kit/types';
import { AlbedoModule } from '@creit.tech/stellar-wallets-kit/modules/albedo';
import { FreighterModule } from '@creit.tech/stellar-wallets-kit/modules/freighter';
import { Keypair } from '@stellar/stellar-sdk';

// Inicializar el kit estático con los módulos correspondientes para la Stellar Testnet
StellarWalletsKit.init({
  network: Networks.TESTNET,
  modules: [
    new FreighterModule(),
    new AlbedoModule()
  ]
});

export type StellarProviderType = 'passkey' | 'freighter' | 'albedo' | 'google';

// Generar un Keypair determinista basado en credenciales de usuario para simular wallets MPC e Inteligentes
export function deriveStellarKeypair(seedText: string): Keypair {
  const encoder = new TextEncoder();
  const data = encoder.encode(seedText + "_ClashOfPizzasSecretSalt2026");
  const seed = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    seed[i] = data[i % data.length] ^ i;
  }
  return Keypair.fromRawEd25519Seed(seed as any);
}

export function useStellarWallet() {
  const [isConnected, setIsConnected] = useState(false);
  const [stellarAddress, setStellarAddress] = useState('');
  const [stellarBalance, setStellarBalance] = useState('0.00');
  const [walletType, setWalletType] = useState<StellarProviderType | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Consultar balance real en XLM desde Horizon Testnet
  const fetchStellarBalance = useCallback(async (addr: string) => {
    if (!addr) return;
    try {
      const res = await fetch(`https://horizon-testnet.stellar.org/accounts/${addr}`);
      if (res.ok) {
        const data = await res.json();
        const nativeBalance = data.balances.find((b: any) => b.asset_type === 'native');
        if (nativeBalance) {
          setStellarBalance(parseFloat(nativeBalance.balance).toFixed(2));
          return;
        }
      }
      setStellarBalance('0.00');
    } catch (err) {
      console.error('Error al obtener balance de Stellar:', err);
      setStellarBalance('0.00');
    }
  }, []);

  // Activar y fondear cuenta determinista automáticamente con Friendbot en Testnet
  const fundWithFriendbot = useCallback(async (addr: string) => {
    try {
      console.log(`Fondeando cuenta ${addr} en Testnet via Friendbot...`);
      const res = await fetch(`https://friendbot.stellar.org/?addr=${addr}`);
      if (res.ok) {
        console.log('Cuenta activada y fondeada con éxito en Stellar Testnet.');
        // Esperar indexación en Horizon
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    } catch (err) {
      console.error('Error al fondear con Friendbot:', err);
    }
  }, []);

  const connectStellar = useCallback(async (type: StellarProviderType, username?: string) => {
    setIsLoading(true);
    try {
      if (type === 'passkey') {
        const usernameClean = username || 'Chef_Soroban';
        // Simular flujo WebAuthn y derivar cuenta Stellar real determinista
        await StellarPasskeysMock.register(usernameClean);
        const kp = deriveStellarKeypair('passkey_' + usernameClean);
        const address = kp.publicKey();
        
        await fundWithFriendbot(address);
        await fetchStellarBalance(address);

        setStellarAddress(address);
        setWalletType('passkey');
        setIsConnected(true);
        localStorage.setItem('clash_stellar_secret', kp.secret());
        return true;
      } else if (type === 'freighter') {
        // Conexión real utilizando @stellar/freighter-api
        const status = await getFreighterStatus();
        const connected = typeof status === 'boolean' ? status : status?.isConnected;
        
        if (connected) {
          const res = await getFreighterAddress();
          if (res && res.address) {
            await fetchStellarBalance(res.address);
            setStellarAddress(res.address);
            setWalletType('freighter');
            setIsConnected(true);
            return true;
          } else {
            // Intentar solicitar acceso si no está aprobado aún
            const access = await requestFreighterAccess();
            if (access && access.address) {
              await fetchStellarBalance(access.address);
              setStellarAddress(access.address);
              setWalletType('freighter');
              setIsConnected(true);
              return true;
            }
          }
        }
        
        // Fallback dinámico si no está instalada la extensión o no está conectada
        console.warn('Freighter no detectado o no disponible en el navegador.');
        alert('Extensión Freighter no detectada o inactiva. Por favor instálala o inicia sesión en ella.');
        return false;

      } else if (type === 'albedo') {
        // Conexión real con Albedo usando Stellar Wallets Kit de forma estática
        StellarWalletsKit.setWallet('albedo');
        const { address } = await StellarWalletsKit.fetchAddress();
        if (address) {
          await fetchStellarBalance(address);
          setStellarAddress(address);
          setWalletType('albedo');
          setIsConnected(true);
          return true;
        }
      } else if (type === 'google') {
        // Simular embedded wallet OAuth (Google / Privy)
        const email = username || 'chef@gmail.com';
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        // Derivar llave Stellar real determinista para el correo
        const kp = deriveStellarKeypair('google_' + email);
        const address = kp.publicKey();
        
        await fundWithFriendbot(address);
        await fetchStellarBalance(address);

        setStellarAddress(address);
        setWalletType('google');
        setIsConnected(true);
        localStorage.setItem('clash_stellar_secret', kp.secret());
        return true;
      }
      return false;
    } catch (err) {
      console.error('Error al conectar con Stellar:', err);
      alert('Error en conexión con la wallet elegida.');
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [fetchStellarBalance, fundWithFriendbot]);

  const disconnectStellar = useCallback(() => {
    setStellarAddress('');
    setStellarBalance('0.00');
    setWalletType(null);
    setIsConnected(false);
    localStorage.removeItem('clash_stellar_secret');
  }, []);

  return {
    isConnected,
    stellarAddress,
    stellarBalance,
    walletType,
    isLoading,
    connectStellar,
    disconnectStellar
  };
}

