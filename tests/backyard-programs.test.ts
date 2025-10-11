import * as anchor from "@coral-xyz/anchor";
import { Program, web3 } from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
} from "@solana/web3.js";
import { airdropIfRequired } from "@solana-developers/helpers";
import { BackyardPrograms } from "../target/types/backyard_programs";
import dotenv from 'dotenv';

dotenv.config();

describe("backyard-programs", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const connection = provider.connection;
  const users = Array.from({ length: 20 }, () => web3.Keypair.generate());
  const secret = JSON.parse(process.env.PROTOCOL_OWNER_KEY!);
  const protocolOwner = Keypair.fromSecretKey(Uint8Array.from(secret));
  let vaultId: PublicKey;
  const program = anchor.workspace.BackyardPrograms as Program<BackyardPrograms>;

  const getTokenBalance = async (
    connection: Connection,
    tokenAccountAddress: PublicKey
  ): Promise<anchor.BN> => {
    const tokenBalance = await connection.getTokenAccountBalance(
      tokenAccountAddress
    );
    return new anchor.BN(tokenBalance.value.amount);
  };

  beforeAll(async () => {
    await airdropIfRequired(
      connection,
      protocolOwner.publicKey,
      2 * LAMPORTS_PER_SOL,
      1 * LAMPORTS_PER_SOL,
    );

    vaultId = web3.Keypair.generate().publicKey;
  });

  it("creates a new vault PDA", async () => {
    const [vaultPda, vaultBump] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), vaultId.toBuffer()],
      program.programId,
    );

    let tx: string | null = null;
    try {
      tx = await program.methods
        .createVault(vaultId)
        .accounts({
          protocolOwner: protocolOwner.publicKey,
          vault: vaultPda,
          systemProgram: web3.SystemProgram.programId,
        })
        .signers([protocolOwner])
        .rpc();
    } catch (e) {
      console.error("Transaction error:", e);
    }

    expect(tx).not.toBeNull();

    const vaultAccount = await program.account.vault.fetch(vaultPda);

    expect(vaultAccount.vaultId.toBase58()).toEqual(vaultId.toBase58());
    expect(vaultAccount.bump).toEqual(vaultBump);
  });
});
