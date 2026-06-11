import { SorobanConfig } from './stellar_config';

export interface StellarPasskeyCredentials {
  id: string;
  rawId: string;
  type: string;
}

export class StellarPasskeysMock {
  // Simular registro y autenticación con Passkeys/WebAuthn en Stellar
  public static async register(username: string): Promise<{ success: boolean; credentialId: string; stellarAddress: string }> {
    console.log(`🔑 [PasskeysMock] Iniciando registro WebAuthn para: ${username}`);
    await new Promise(resolve => setTimeout(resolve, 1200));

    // Generar dirección de Stellar simulada
    const mockAddress = `G${Math.random().toString(36).substring(2, 15).toUpperCase().padEnd(55, 'X')}`;
    const credentialId = btoa(Math.random().toString()).slice(0, 16);
    
    console.log(`🔑 [PasskeysMock] Registro exitoso. Cuenta Stellar asignada: ${mockAddress}`);
    return {
      success: true,
      credentialId,
      stellarAddress: mockAddress
    };
  }

  public static async login(credentialId: string): Promise<{ success: boolean; stellarAddress: string }> {
    console.log(`🔑 [PasskeysMock] Autenticando con credentialId: ${credentialId}`);
    await new Promise(resolve => setTimeout(resolve, 800));

    const mockAddress = `G${Math.random().toString(36).substring(2, 15).toUpperCase().padEnd(55, 'X')}`;
    return {
      success: true,
      stellarAddress: mockAddress
    };
  }
}
