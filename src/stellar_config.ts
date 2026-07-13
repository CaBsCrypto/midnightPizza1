// Design & specifications for Soroban smart contracts & Passkeys integration

export interface StellarSorobanConfig {
  network: 'TESTNET' | 'MAINNET' | 'FUTURENET';
  horizonUrl: string;
  sorobanRpcUrl: string;
  contractId: string;
  sponsorPublicKey?: string;
  sponsorPrivateKey?: string; // Utilizado en desarrollo local
}

export const SorobanConfig: StellarSorobanConfig = {
  network: 'TESTNET',
  horizonUrl: 'https://horizon-testnet.stellar.org',
  sorobanRpcUrl: 'https://soroban-testnet.stellar.org',
  contractId: 'CBLFGLVEWM7JFC5C3P4R2DIZB7VR7KNRYWHFGWLVAJSOF4PR3QGO5ZWS',
  sponsorPublicKey: 'GA7W5P7B63Q3Z2WURGZ6D4H6E7O6Y6Q4D6E7O6Y6Q4D6E7O6Y6Q4D6E7', // Clave demo
  sponsorPrivateKey: 'SA7W5P7B63Q3Z2WURGZ6D4H6E7O6Y6Q4D6E7O6Y6Q4D6E7O6Y6Q4D6E7' // Clave demo local
};
