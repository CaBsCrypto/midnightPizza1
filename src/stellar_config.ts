// Design & specifications for Soroban smart contracts & Passkeys integration

export interface StellarSorobanConfig {
  network: 'TESTNET' | 'MAINNET' | 'FUTURENET';
  horizonUrl: string;
  sorobanRpcUrl: string;
  contractId: string;
}

export const SorobanConfig: StellarSorobanConfig = {
  network: 'TESTNET',
  horizonUrl: 'https://horizon-testnet.stellar.org',
  sorobanRpcUrl: 'https://soroban-testnet.stellar.org',
  contractId: 'C...PIZZA_CONTRACT_SOROBAN_ID...'
};
