import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import {
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
  const secret = JSON.parse(process.env.PROTOCOL_OWNER_KEY!);
  const protocolOwner = Keypair.fromSecretKey(Uint8Array.from(secret));
  const program = anchor.workspace.BackyardPrograms as Program<BackyardPrograms>;
  const vaultId = Keypair.generate().publicKey;
  let vaultPda: PublicKey;


  beforeAll(async () => {
    await airdropIfRequired(
      connection,
      protocolOwner.publicKey,
      2 * LAMPORTS_PER_SOL,
      1 * LAMPORTS_PER_SOL,
    );

    vaultPda = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), vaultId.toBuffer()],
      program.programId,
    )[0];
  });

  it("creates a new vault PDA", async () => {
    const tx = await program.methods
      .createVault(vaultId)
      .accounts({})
      .signers([protocolOwner])
      .rpc();


    expect(tx).not.toBeNull();

    const vaultAccount = await program.account.vault.fetch(vaultPda);

    expect(vaultAccount.vaultId.toBase58()).toEqual(vaultId.toBase58());
  });
});
