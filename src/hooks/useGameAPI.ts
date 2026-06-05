import { useCallback, useState } from 'react';

export interface APIResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export function useGameAPI(baseURL: string = 'http://localhost:8080/api') {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Registrar un chef en la red multiplayer descentralizada de Go
  const registerChef = useCallback(async (name: string, walletAddress: string): Promise<APIResponse<any>> => {
    setLoading(true);
    setError(null);
    try {
      console.log(`🌐 POST ${baseURL}/chefs - Registrando chef: ${name}`);
      // Simular delay de red
      await new Promise(resolve => setTimeout(resolve, 800));
      
      // En producción:
      // const res = await fetch(`${baseURL}/chefs`, {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify({ name, walletAddress })
      // });
      // return await res.json();

      return {
        success: true,
        data: {
          id: `chef_${Math.floor(Math.random() * 10000)}`,
          name,
          walletAddress,
          registeredAt: new Date().toISOString()
        }
      };
    } catch (err: any) {
      setError(err.message || 'Error al conectar con la API de Go');
      return { success: false, error: err.message };
    } finally {
      setLoading(false);
    }
  }, [baseURL]);

  // Enviar el compromiso de tablero inicial (Merkle Root) al servidor
  const submitBoardCommitment = useCallback(async (matchId: string, chefId: string, merkleRoot: string): Promise<APIResponse<any>> => {
    setLoading(true);
    setError(null);
    try {
      console.log(`🌐 POST ${baseURL}/matches/${matchId}/commitment - Commit: ${merkleRoot}`);
      await new Promise(resolve => setTimeout(resolve, 600));

      return {
        success: true,
        data: { matchId, chefId, commitment: merkleRoot, status: 'committed' }
      };
    } catch (err: any) {
      setError(err.message);
      return { success: false, error: err.message };
    } finally {
      setLoading(false);
    }
  }, [baseURL]);

  // Enviar una mordida (bite move) auditada al servidor
  const sendBiteMove = useCallback(async (matchId: string, chefId: string, row: number, col: number, proof: string): Promise<APIResponse<any>> => {
    setLoading(true);
    try {
      console.log(`🌐 POST ${baseURL}/matches/${matchId}/bite - Celda: [${row}, ${col}] con prueba ZK`);
      await new Promise(resolve => setTimeout(resolve, 500));

      return {
        success: true,
        data: {
          matchId,
          chefId,
          row,
          col,
          proven: true,
          timestamp: Date.now()
        }
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    } finally {
      setLoading(false);
    }
  }, [baseURL]);

  return {
    loading,
    error,
    registerChef,
    submitBoardCommitment,
    sendBiteMove
  };
}
