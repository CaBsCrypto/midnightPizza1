import { useState, useCallback, useEffect } from 'react';
import { StellarWalletsKit } from '@creit.tech/stellar-wallets-kit/sdk';
import { Networks, SwkAppDarkTheme } from '@creit.tech/stellar-wallets-kit/types';
import { AlbedoModule } from '@creit.tech/stellar-wallets-kit/modules/albedo';
import { FreighterModule } from '@creit.tech/stellar-wallets-kit/modules/freighter';
import { xBullModule } from '@creit.tech/stellar-wallets-kit/modules/xbull';
import { LobstrModule } from '@creit.tech/stellar-wallets-kit/modules/lobstr';
import { HanaModule } from '@creit.tech/stellar-wallets-kit/modules/hana';
import { LedgerModule } from '@creit.tech/stellar-wallets-kit/modules/ledger';
import { TransactionBuilder, Networks as SdkNetworks } from '@stellar/stellar-sdk';
import { usePrivy, useLoginWithPasskey, useSignupWithPasskey } from '@privy-io/react-auth';
import { useCreateWallet, useSignRawHash } from '@privy-io/react-auth/extended-chains';

// Inicializar el kit estático con los módulos correspondientes para la Stellar Testnet
let _kitInitialized = false;
try {
  StellarWalletsKit.init({
    network: Networks.TESTNET,
    theme: SwkAppDarkTheme,
    modules: [
      new FreighterModule(),
      new AlbedoModule(),
      new xBullModule(),
      new LobstrModule(),
      new HanaModule(),
      new LedgerModule()
    ]
  });
  _kitInitialized = true;
} catch (e) {
  console.warn('[StellarWalletsKit] Error al inicializar el kit (modo degradado):', e);
}

export type StellarProviderType = 'passkey' | 'freighter' | 'albedo' | 'xbull' | 'lobstr' | 'hana' | 'ledger' | 'google' | 'kit';

// Wallets gestionadas directamente por el usuario en su propio proveedor externo.
// Para 'google' y 'passkey' usamos el embedded wallet de Stellar de Privy: la clave
// privada vive dentro del enclave seguro de Privy y nunca llega al navegador de la app.
const EXTERNAL_KIT_WALLETS = new Set(['freighter', 'albedo', 'xbull', 'lobstr', 'hana', 'ledger']);

function getWalletCookie(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp('(^| )stellar_wallet=([^;]+)'));
  return match ? match[2] : null;
}

function setWalletCookie(address: string) {
  if (typeof window === 'undefined') return;
  const isProd = window.location.hostname.endsWith('spicycrust.com');
  const domain = isProd ? '; domain=.spicycrust.com' : '';
  document.cookie = `stellar_wallet=${address}${domain}; path=/; max-age=86400; Secure; SameSite=Lax`;
}

function deleteWalletCookie() {
  if (typeof window === 'undefined') return;
  const isProd = window.location.hostname.endsWith('spicycrust.com');
  const domain = isProd ? '; domain=.spicycrust.com' : '';
  document.cookie = `stellar_wallet=; path=/; max-age=0${domain}; Secure; SameSite=Lax`;
}

export function useStellarWallet() {
  const [isConnected, setIsConnected] = useState(false);
  const [stellarAddress, setStellarAddress] = useState('');
  const [stellarBalance, setStellarBalance] = useState('0.00');
  const [walletType, setWalletType] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const { login, ready, authenticated, user, logout } = usePrivy();
  const { loginWithPasskey } = useLoginWithPasskey();
  const { signupWithPasskey } = useSignupWithPasskey();
  const { createWallet } = useCreateWallet();
  const { signRawHash } = useSignRawHash();

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

  // Activar y fondear cuenta automáticamente con Friendbot en Testnet
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

  // Cargar cookie al inicio
  useEffect(() => {
    const activeWalletAddress = getWalletCookie();
    if (activeWalletAddress && !stellarAddress) {
      setStellarAddress(activeWalletAddress);
      setWalletType('google');
      setIsConnected(true);
      fetchStellarBalance(activeWalletAddress);
      console.log("Sesión activa de Stellar detectada en cookie:", activeWalletAddress);
    }
  }, [fetchStellarBalance, stellarAddress]);

  // Al autenticarse con Privy (Google o Passkey), obtener o crear el embedded wallet de Stellar.
  // La clave privada nunca sale del enclave seguro de Privy; el cliente solo recibe la dirección pública.
  useEffect(() => {
    if (!ready || !authenticated || !user) return;

    const setupStellarWallet = async () => {
      setIsLoading(true);
      try {
        const existing = user.linkedAccounts.find(
          (a: any) => a.type === 'wallet' && a.chainType === 'stellar'
        ) as any;

        const address = existing?.address || (await createWallet({ chainType: 'stellar' })).wallet.address;

        await fundWithFriendbot(address);
        await fetchStellarBalance(address);

        setStellarAddress(address);
        setWalletType('google');
        setIsConnected(true);
        setWalletCookie(address);
        console.log("Embedded wallet de Stellar (Privy) lista para:", address);
      } catch (e) {
        console.error("Error obteniendo el embedded wallet de Stellar desde Privy", e);
      } finally {
        setIsLoading(false);
      }
    };
    setupStellarWallet();
  }, [ready, authenticated, user, createWallet, fundWithFriendbot, fetchStellarBalance]);

  const connectStellar = useCallback(async (type: StellarProviderType, username?: string) => {
    setIsLoading(true);
    try {
      if (type === 'passkey') {
        // Passkey real (WebAuthn) a través de Privy; sin derivación de claves en el cliente.
        try {
          await loginWithPasskey();
        } catch {
          await signupWithPasskey();
        }
        return true;
      } else if (type === 'google') {
        // Lanzar el login modal real de Privy
        if (ready) {
          login();
          return true;
        }
      } else if (type === 'kit') {
        // Abrir el modal oficial de selección de Stellar Wallets Kit
        const { address } = await StellarWalletsKit.authModal();
        if (address) {
          await fetchStellarBalance(address);
          setStellarAddress(address);
          const activeModule = StellarWalletsKit.selectedModule;
          setWalletType(activeModule?.productId || 'kit');
          setIsConnected(true);
          return true;
        }
      } else {
        // Conectar una wallet del kit directamente
        StellarWalletsKit.setWallet(type);
        const { address } = await StellarWalletsKit.getAddress();
        if (address) {
          await fetchStellarBalance(address);
          setStellarAddress(address);
          setWalletType(type);
          setIsConnected(true);
          return true;
        }
      }
      return false;
    } catch (err) {
      console.error('Error al conectar con Stellar:', err);
      alert('Error en conexión con la wallet elegida.');
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [fetchStellarBalance, ready, login, loginWithPasskey, signupWithPasskey]);

  const disconnectStellar = useCallback(() => {
    setStellarAddress('');
    setStellarBalance('0.00');
    setWalletType(null);
    setIsConnected(false);
    deleteWalletCookie();
    if (authenticated) {
      logout();
    }
  }, [authenticated, logout]);

  // Firma una transacción Stellar sin exponer ninguna clave privada al código de la app:
  // - Wallets externas (Freighter/Albedo/etc.) firman en su propia extensión/dispositivo.
  // - Embedded wallet de Privy (Google/Passkey) firma vía enclave seguro, devolviendo solo la firma.
  const signStellarTransaction = useCallback(async (txXdr: string): Promise<string> => {
    if (walletType && EXTERNAL_KIT_WALLETS.has(walletType)) {
      const res = await StellarWalletsKit.signTransaction(txXdr, {
        address: stellarAddress,
        networkPassphrase: Networks.TESTNET
      });
      return res.signedTxXdr;
    }

    const tx = TransactionBuilder.fromXDR(txXdr, SdkNetworks.TESTNET) as any;
    const hash = tx.hash() as Buffer;
    const { signature } = await signRawHash({
      address: stellarAddress,
      chainType: 'stellar',
      hash: (`0x${hash.toString('hex')}`) as `0x${string}`
    });
    const signatureBase64 = Buffer.from(signature.slice(2), 'hex').toString('base64');
    tx.addSignature(stellarAddress, signatureBase64);
    return tx.toXDR();
  }, [walletType, stellarAddress, signRawHash]);

  return {
    isConnected,
    stellarAddress,
    stellarBalance,
    walletType,
    isLoading,
    connectStellar,
    disconnectStellar,
    signStellarTransaction
  };
}
