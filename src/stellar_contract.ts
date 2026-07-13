import {
  Horizon,
  TransactionBuilder,
  Networks,
  Operation,
  Address,
  xdr,
  Keypair
} from '@stellar/stellar-sdk';
import { SorobanConfig } from './stellar_config';

const server = new Horizon.Server("https://horizon-testnet.stellar.org");

// Envuelve una transacción ya firmada por el jugador con un fee-bump del patrocinador,
// y la envía. No conoce ni necesita ninguna clave privada del jugador: la firma
// del jugador llega ya hecha por `signTransaction` (wallet externa o embedded wallet de Privy).
async function submitSigned(signedInnerXdr: string): Promise<string> {
  const signedInnerTx = TransactionBuilder.fromXDR(signedInnerXdr, Networks.TESTNET) as any;
  let finalXdr = signedInnerXdr;

  if (SorobanConfig.sponsorPrivateKey && SorobanConfig.sponsorPublicKey) {
    const sponsorKp = Keypair.fromSecret(SorobanConfig.sponsorPrivateKey);
    const feeBump = TransactionBuilder.buildFeeBumpTransaction(
      sponsorKp,
      '200000', // Tarifa del fee-bump
      signedInnerTx,
      Networks.TESTNET
    );
    feeBump.sign(sponsorKp);
    finalXdr = feeBump.toXDR();
  }

  console.log("Enviando XDR co-firmado (Patrocinado) a Stellar Testnet...");
  const txReady = TransactionBuilder.fromXDR(finalXdr, Networks.TESTNET);
  const response = await server.submitTransaction(txReady);
  return response.hash;
}

export async function submitSorobanBite({
  contractId,
  playerAddress,
  row,
  col,
  zkProofHash,
  signTransaction
}: {
  contractId: string;
  playerAddress: string;
  row: number;
  col: number;
  zkProofHash: Uint8Array;
  signTransaction: (txXdr: string) => Promise<string>;
}) {
  console.log(`📡 Construyendo transacción Soroban para submit_bite en ${contractId}...`);
  const account = await server.loadAccount(playerAddress);

  const scPlayer = new Address(playerAddress).toScVal();
  const scRow = xdr.ScVal.scvU32(row);
  const scCol = xdr.ScVal.scvU32(col);
  const scHash = xdr.ScVal.scvBytes(zkProofHash as any);

  const contractAddress = new Address(contractId);

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
  .setTimeout(30);

  const innerTx = tx.build();

  // Firmar con el proveedor activo del jugador (wallet externa o embedded wallet de Privy).
  const signedInnerXdr = await signTransaction(innerTx.toXDR());

  return submitSigned(signedInnerXdr);
}

export async function initializeSorobanGame({
  contractId,
  p1Address,
  p2Address,
  p1Commitment,
  p2Commitment,
  playerAddress,
  signTransaction
}: {
  contractId: string;
  p1Address: string;
  p2Address: string;
  p1Commitment: Uint8Array;
  p2Commitment: Uint8Array;
  playerAddress: string;
  signTransaction: (txXdr: string) => Promise<string>;
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
  .setTimeout(30);

  const innerTx = tx.build();

  const signedInnerXdr = await signTransaction(innerTx.toXDR());

  return submitSigned(signedInnerXdr);
}
