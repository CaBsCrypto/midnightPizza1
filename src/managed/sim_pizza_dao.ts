import type * as __compactRuntime from '@midnight-ntwrk/compact-runtime';

export interface Ledger {
  readonly public_p1_commitment: Uint8Array;
  readonly public_p2_commitment: Uint8Array;
  readonly public_p1_hp: bigint;
  readonly public_p2_hp: bigint;
  readonly public_p1_score: bigint;
  readonly public_p2_score: bigint;
  readonly public_game_active: boolean;
  readonly public_turn_p1: boolean;
}

export interface Witnesses<T = any> {
  get_private_board(context: __compactRuntime.WitnessContext<Ledger, T>): Promise<Uint8Array | [Uint8Array, T]> | Uint8Array | [Uint8Array, T];
  get_private_bite_val(context: __compactRuntime.WitnessContext<Ledger, T>): Promise<bigint | [bigint, T]> | bigint | [bigint, T];
}

export interface PureCircuits<T = any> {
  readonly verify_board_commitment: (
    context: __compactRuntime.CircuitContext<T>,
    board: Uint8Array,
    commitment: Uint8Array
  ) => __compactRuntime.CircuitResults<T, boolean>;

  readonly verify_bite_integrity: (
    context: __compactRuntime.CircuitContext<T>,
    board: Uint8Array,
    expected_commitment: Uint8Array
  ) => __compactRuntime.CircuitResults<T, boolean>;
}

export interface ImpureCircuits<T = any> {
  readonly initialize_game: (
    context: __compactRuntime.CircuitContext<T>,
    p1_commit: Uint8Array,
    p2_commit: Uint8Array
  ) => __compactRuntime.CircuitResults<T, void>;

  readonly submit_bite_proof: (
    context: __compactRuntime.CircuitContext<T>,
    index: bigint,
    cell_value: bigint,
    is_p1_attacking: boolean
  ) => __compactRuntime.CircuitResults<T, void>;
}

// Helper to extract Ledger from ContractState or CircuitContext query context
export function ledger(state: any): Ledger {
  if (state && state.public_p1_commitment !== undefined) {
    return state;
  }
  if (state && state.data && state.data.public_p1_commitment !== undefined) {
    return state.data;
  }
  return {
    public_p1_commitment: new Uint8Array(32),
    public_p2_commitment: new Uint8Array(32),
    public_p1_hp: 3n,
    public_p2_hp: 3n,
    public_p1_score: 0n,
    public_p2_score: 0n,
    public_game_active: false,
    public_turn_p1: true,
  };
}

export const contractReferenceLocations: __compactRuntime.ContractReferenceLocations = {
  tag: 'publicLedgerArray',
  indices: undefined,
};

const mockRunningCost = (): any => ({
  cumulativeRunningCost: 0n,
  gasLimit: 100000n,
});

const mockProofData = (input: any, output: any): __compactRuntime.ProofData => ({
  input: input as any,
  output: output as any,
  publicTranscript: [],
  privateTranscriptOutputs: [],
});

function mockHash256(data: Uint8Array): Uint8Array {
  const hash = new Uint8Array(32);
  for (let i = 0; i < data.length; i++) {
    hash[i % 32] = (hash[i % 32] + data[i] * 33) & 0xff;
  }
  return hash;
}

function updateLedgerState<T>(
  context: __compactRuntime.CircuitContext<T>,
  newLedger: Partial<Ledger>
): __compactRuntime.CircuitContext<T> {
  const currentLedger = ledger(context.currentQueryContext);
  const updatedLedger = { ...currentLedger, ...newLedger };

  return {
    ...context,
    currentQueryContext: updatedLedger as any,
  };
}

export class Contract<T, W extends Witnesses<T> = Witnesses<T>> {
  readonly witnesses: W;
  readonly circuits: ImpureCircuits<T>;
  readonly pureCircuits: PureCircuits<T>;

  constructor(witnesses: W) {
    this.witnesses = witnesses;
    this.circuits = {
      initialize_game: (context, p1_commit, p2_commit) => {
        const nextContext = updateLedgerState(context, {
          public_p1_commitment: p1_commit,
          public_p2_commitment: p2_commit,
          public_p1_hp: 3n,
          public_p2_hp: 3n,
          public_p1_score: 0n,
          public_p2_score: 0n,
          public_game_active: true,
          public_turn_p1: true,
        });

        return {
          result: undefined,
          proofData: mockProofData({ p1_commit, p2_commit }, undefined),
          context: nextContext,
          gasCost: mockRunningCost(),
        };
      },
      submit_bite_proof: (context, index, cell_value, is_p1_attacking) => {
        const currentLedger = ledger(context.currentQueryContext);
        
        const val = Number(cell_value);
        let hp1 = currentLedger.public_p1_hp;
        let hp2 = currentLedger.public_p2_hp;
        let s1 = currentLedger.public_p1_score;
        let s2 = currentLedger.public_p2_score;
        let turn_p1 = currentLedger.public_turn_p1;

        if (is_p1_attacking) {
          if (val >= 1 && val <= 4) {
            s1 = s1 + 50n;
          } else if (val === 5 || val === 6) {
            const dmg = val === 5 ? 1n : 2n;
            hp1 = hp1 > dmg ? hp1 - dmg : 0n;
          } else if (val === 7 || val === 8) {
            const heal = val === 7 ? 1n : 2n;
            hp1 = hp1 + heal > 5n ? 5n : hp1 + heal;
          } else if (val === 9) {
            hp1 = hp1 + 2n > 5n ? 5n : hp1 + 2n;
            s1 = s1 + 500n;
          }
          turn_p1 = false;
        } else {
          if (val >= 1 && val <= 4) {
            s2 = s2 + 50n;
          } else if (val === 5 || val === 6) {
            const dmg = val === 5 ? 1n : 2n;
            hp2 = hp2 > dmg ? hp2 - dmg : 0n;
          } else if (val === 7 || val === 8) {
            const heal = val === 7 ? 1n : 2n;
            hp2 = hp2 + heal > 5n ? 5n : hp2 + heal;
          } else if (val === 9) {
            hp2 = hp2 + 2n > 5n ? 5n : hp2 + 2n;
            s2 = s2 + 500n;
          }
          turn_p1 = true;
        }

        const nextContext = updateLedgerState(context, {
          public_p1_hp: hp1,
          public_p2_hp: hp2,
          public_p1_score: s1,
          public_p2_score: s2,
          public_turn_p1: turn_p1,
        });

        return {
          result: undefined,
          proofData: mockProofData({ index, cell_value, is_p1_attacking }, undefined),
          context: nextContext,
          gasCost: mockRunningCost(),
        };
      }
    };

    this.pureCircuits = {
      verify_board_commitment: (context, board, commitment) => {
        const hash = mockHash256(board);
        const isValid = hash.every((val, i) => val === commitment[i]);
        return {
          result: isValid,
          proofData: mockProofData(board, isValid),
          context,
          gasCost: mockRunningCost(),
        };
      },
      verify_bite_integrity: (context, board, expected_commitment) => {
        const hash = mockHash256(board);
        const isValid = hash.every((val, i) => val === expected_commitment[i]);
        return {
          result: isValid,
          proofData: mockProofData(board, isValid),
          context,
          gasCost: mockRunningCost(),
        };
      }
    };
  }

  initialState(
    context: __compactRuntime.ConstructorContext<T>,
    initial_root: Uint8Array
  ): __compactRuntime.ConstructorResult<T> {
    const initialLedger: Ledger = {
      public_p1_commitment: initial_root,
      public_p2_commitment: mockHash256(new TextEncoder().encode("empty")),
      public_p1_hp: 3n,
      public_p2_hp: 3n,
      public_p1_score: 0n,
      public_p2_score: 0n,
      public_game_active: false,
      public_turn_p1: true,
    };

    return {
      currentContractState: initialLedger as any,
      currentPrivateState: context.initialPrivateState,
      currentZswapLocalState: context.initialZswapLocalState,
    };
  }
}

export class SimPizzaDAO<T, W extends Witnesses<T> = Witnesses<T>> extends Contract<T, W> {}
