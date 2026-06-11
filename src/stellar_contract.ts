import { 
  Horizon, 
  TransactionBuilder, 
  Networks, 
  Operation, 
  Address, 
  xdr, 
  Keypair
} from '@stellar/stellar-sdk';
import { StellarWalletsKit } from '@creit.tech/stellar-wallets-kit/sdk';

const server = new Horizon.Server("https://horizon-testnet.stellar.org");

export async function submitSorobanBite({
  contractId,
  playerAddress,
  row,
  col,
  zkProofHash,
  walletType,
  secret
}: {
  contractId: string;
  playerAddress: string;
  row: number;
  col: number;
  zkProofHash: Uint8Array;
  walletType: string;
  secret?: string | null;
}) {
  console.log(`📡 Construyendo transacción Soroban para submit_bite en ${contractId}...`);
  
  // 1. Cargar cuenta del pagador de gas
  const account = await server.loadAccount(playerAddress);
  
  // 2. Construir los argumentos en formato ScVal
  const scPlayer = new Address(playerAddress).toScVal();
  const scRow = xdr.ScVal.scvU32(row);
  const scCol = xdr.ScVal.scvU32(col);
  const scHash = xdr.ScVal.scvBytes(zkProofHash as any);
  
  const contractAddress = new Address(contractId);
  
  // 3. Crear operación de llamada de contrato
  const op = Operation.invokeHostFunction({
    func: xdr.HostFunction.hostFunctionTypeInvokeContract(
      new xdr.InvokeContractArgs({
        contractAddress: contractAddress.toScAddress(),
        functionName: 'submit_bite',
        args: [scPlayer, scRow, scCol, scHash]
      })
    ),
    auth: []
  });
  
  const tx = new TransactionBuilder(account, {
    fee: '100000', // Tarifa de Soroban
    networkPassphrase: Networks.TESTNET
  })
  .addOperation(op)
  .setTimeout(30)
  .build();
  
  const xdrOriginal = tx.toXDR();
  let xdrSigned = '';
  
  // 4. Firmar con el proveedor activo
  if (walletType === 'freighter' || walletType === 'albedo') {
    const res = await StellarWalletsKit.signTransaction(xdrOriginal, {
      address: playerAddress,
      networkPassphrase: Networks.TESTNET
    });
    xdrSigned = res.signedTxXdr;
  } else {
    // Google/Passkeys: firma local criptográfica
    const secretKey = secret || localStorage.getItem('clash_stellar_secret');
    if (!secretKey) {
      throw new Error("Clave privada no encontrada para firmar localmente.");
    }
    const kp = Keypair.fromSecret(secretKey);
    tx.sign(kp);
    xdrSigned = tx.toXDR();
  }
  
  // 5. Enviar a Horizon Testnet
  console.log("Enviando XDR firmado a Stellar Testnet...");
  const txReady = TransactionBuilder.fromXDR(xdrSigned, Networks.TESTNET);
  const response = await server.submitTransaction(txReady);
  
  console.log(`[Stellar RPC] Invocación de Soroban exitosa. Hash: ${response.hash}`);
  return response.hash;
}

export async function initializeSorobanGame({
  contractId,
  p1Address,
  p2Address,
  p1Commitment,
  p2Commitment,
  playerAddress,
  walletType,
  secret
}: {
  contractId: string;
  p1Address: string;
  p2Address: string;
  p1Commitment: Uint8Array;
  p2Commitment: Uint8Array;
  playerAddress: string;
  walletType: string;
  secret?: string | null;
}) {
  console.log("📡 Inicializando juego de Soroban on-chain...");
  const account = await server.loadAccount(playerAddress);
  const contractAddress = new Address(contractId);
  
  const scP1 = new Address(p1Address).toScVal();
  const scP2 = new Address(p2Address).toScVal();
  const scP1Commit = xdr.ScVal.scvBytes(p1Commitment as any);
  const scP2Commit = xdr.ScVal.scvBytes(p2Commitment as any);
  
  const op = Operation.invokeHostFunction({
    func: xdr.HostFunction.hostFunctionTypeInvokeContract(
      new xdr.InvokeContractArgs({
        contractAddress: contractAddress.toScAddress(),
        functionName: 'initialize_game',
        args: [scP1, scP2, scP1Commit, scP2Commit]
      })
    ),
    auth: []
  });
  
  const tx = new TransactionBuilder(account, {
    fee: '100000',
    networkPassphrase: Networks.TESTNET
  })
  .addOperation(op)
  .setTimeout(30)
  .build();
  
  const xdrOriginal = tx.toXDR();
  let xdrSigned = '';
  
  if (walletType === 'freighter' || walletType === 'albedo') {
    const res = await StellarWalletsKit.signTransaction(xdrOriginal, {
      address: playerAddress,
      networkPassphrase: Networks.TESTNET
    });
    xdrSigned = res.signedTxXdr;
  } else {
    const secretKey = secret || localStorage.getItem('clash_stellar_secret');
    if (!secretKey) {
      throw new Error("Clave privada no encontrada.");
    }
    const kp = Keypair.fromSecret(secretKey);
    tx.sign(kp);
    xdrSigned = tx.toXDR();
  }
  
  const txReady = TransactionBuilder.fromXDR(xdrSigned, Networks.TESTNET);
  const response = await server.submitTransaction(txReady);
  return response.hash;
}
