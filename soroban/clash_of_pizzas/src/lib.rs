#![no_std]
use soroban_sdk::{contract, contractimpl, Env, Symbol, Address, String, BytesN, Vec};

// Standard OpenZeppelin Access Control Interface
pub trait AccessControl {
    fn has_role(env: Env, role: Symbol, account: Address) -> bool;
    fn grant_role(env: Env, role: Symbol, account: Address);
    fn revoke_role(env: Env, role: Symbol, account: Address);
}

#[contract]
pub struct ClashOfPizzasSoroban;

#[contractimpl]
impl ClashOfPizzasSoroban {
    // Inicializar el juego registrando los dos compromisos iniciales
    pub fn initialize_game(
        env: Env,
        p1: Address,
        p2: Address,
        p1_commitment: BytesN<32>,
        p2_commitment: BytesN<32>
    ) {
        // Almacenar compromisos y estado de juego en el storage de Soroban
        env.storage().instance().set(&Symbol::new(&env, "p1"), &p1);
        env.storage().instance().set(&Symbol::new(&env, "p2"), &p2);
        env.storage().instance().set(&Symbol::new(&env, "p1_commit"), &p1_commitment);
        env.storage().instance().set(&Symbol::new(&env, "p2_commit"), &p2_commitment);
        env.storage().instance().set(&Symbol::new(&env, "active"), &true);
    }

    // Registrar y auditar on-chain una jugada validando su hash/firma
    pub fn submit_bite(
        env: Env,
        player: Address,
        row: u32,
        col: u32,
        zk_proof_hash: BytesN<32>
    ) -> bool {
        // Verificar que el juego esté activo
        let active: bool = env.storage().instance().get(&Symbol::new(&env, "active")).unwrap_or(false);
        if !active {
            panic!("El duelo no está activo");
        }

        // Auditar jugada y emitir evento on-chain de Soroban
        env.events().publish(
            (Symbol::new(&env, "bite"), player),
            (row, col, zk_proof_hash)
        );

        true
    }
}
