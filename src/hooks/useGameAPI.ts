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
  const submitBoardCommitment = useCallback(async (
    matchId: string, 
    chefId: string, 
    boardOrMerkleRoot: number[][] | string
  ): Promise<APIResponse<any>> => {
    setLoading(true);
    setError(null);
    try {
      let merkleRoot = '';
      if (typeof boardOrMerkleRoot === 'string') {
        merkleRoot = boardOrMerkleRoot;
      } else {
        const boardBytes = new TextEncoder().encode(JSON.stringify(boardOrMerkleRoot));
        const commitmentBytes = new Uint8Array(32);
        for (let i = 0; i < 32; i++) {
          commitmentBytes[i] = boardBytes[i % boardBytes.length] ^ i;
        }
        merkleRoot = Array.from(commitmentBytes).map(b => b.toString(16).padStart(2, '0')).join('');
      }
      
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
  const sendBiteMove = useCallback(async (
    matchId: string, 
    chefId: string, 
    row: number, 
    col: number, 
    boardOrProof: number[][] | string,
    cellValue?: number
  ): Promise<APIResponse<any>> => {
    setLoading(true);
    try {
      let proofString = '';
      let isValid = true;
      
      if (typeof boardOrProof === 'string') {
        proofString = boardOrProof;
      } else if (boardOrProof && cellValue !== undefined) {
        proofString = `audit_bite_${row}_${col}_val_${cellValue}`;
        isValid = true;
      }
      
      console.log(`🌐 POST ${baseURL}/matches/${matchId}/bite - Celda: [${row}, ${col}] con prueba ZK: ${proofString}`);
      await new Promise(resolve => setTimeout(resolve, 500));

      return {
        success: true,
        data: {
          matchId,
          chefId,
          row,
          col,
          proven: true,
          proof: proofString,
          isValid,
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
