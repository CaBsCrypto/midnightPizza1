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
  contractId: 'CC3Z4U7K6GZCSMBMRNRPP6O255PBL7OSBDSHBYS6N2D637T72X7T72X72'
};
