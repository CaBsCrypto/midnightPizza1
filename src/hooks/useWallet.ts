import { useState, useEffect, useCallback } from 'react';
import { PizzeriaWallet } from '../wallet';

const walletInstance = new PizzeriaWallet();

export function useWallet() {
  const [isConnected, setIsConnected] = useState(false);
  const [address, setAddress] = useState('');
  const [balance, setBalance] = useState<{ night: string; dust: string } | null>(null);
  const [isLaceAvailable, setIsLaceAvailable] = useState(false);
  const [walletKeys, setWalletKeys] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Comprobar la disponibilidad de Lace al montar
  useEffect(() => {
    setIsLaceAvailable(walletInstance.isLaceAvailable());
  }, []);

  const updateWalletState = useCallback(async () => {
    const connected = walletInstance.getIsConnected();
    setIsConnected(connected);
    if (connected) {
      setAddress(walletInstance.getAddress());
      setWalletKeys(walletInstance.getWalletKeys());
      const bal = await walletInstance.getBalance();
      setBalance(bal);
    } else {
      setAddress('');
      setBalance(null);
      setWalletKeys([]);
    }
  }, []);

  const connectWallet = useCallback(async () => {
    setIsLoading(true);
    try {
      const success = await walletInstance.connect();
      if (success) {
        await updateWalletState();
      }
      return success;
    } catch (err) {
      console.error('Error al conectar Lace Wallet en React hook:', err);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [updateWalletState]);

  const disconnectWallet = useCallback(() => {
    walletInstance.disconnect();
    updateWalletState();
  }, [updateWalletState]);

  const signClaim = useCallback(async (score: number, reward: number, merkleRoot: string) => {
    setIsLoading(true);
    try {
      const success = await walletInstance.signClaimTransaction(score, reward, merkleRoot);
      await updateWalletState();
      return success;
    } catch (err) {
      console.error('Error firmando transacción de recompensa:', err);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [updateWalletState]);

  const revealBoard = useCallback(async (board: number[][], salt: Uint8Array, isP1: boolean) => {
    setIsLoading(true);
    try {
      const success = await walletInstance.revealBoardTransaction(board, salt, isP1);
      await updateWalletState();
      return success;
    } catch (err) {
      console.error('Error al revelar el tablero en Midnight contract:', err);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [updateWalletState]);

  const savePrivateBoardAndSalt = useCallback(async (board: number[][], salt: Uint8Array) => {
    await walletInstance.savePrivateBoardAndSalt(board, salt);
  }, []);

  const getPrivateBoardAndSalt = useCallback(async () => {
    return await walletInstance.getPrivateBoardAndSalt();
  }, []);

  const validateBoardAgainstCommitment = useCallback(async (commitmentStr: string) => {
    return await walletInstance.validateBoardAgainstCommitment(commitmentStr);
  }, []);

  return {
    isConnected,
    address,
    balance,
    isLaceAvailable,
    walletKeys,
    isLoading,
    connectWallet,
    disconnectWallet,
    signClaim,
    revealBoard,
    savePrivateBoardAndSalt,
    getPrivateBoardAndSalt,
    validateBoardAgainstCommitment,
    walletInstance, // Exponer la instancia por si se requiere interacción de bajo nivel
  };
}
