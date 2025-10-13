import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import {
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  sendAndConfirmTransaction,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import {
  createAssociatedTokenAccount,
  createInitializeMint2Instruction,
  createInitializeNonTransferableMintInstruction,
  createMint,
  ExtensionType,
  getAssociatedTokenAddressSync,
  getExtensionTypes,
  getMintLen,
  mintTo,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  unpackMint,
} from "@solana/spl-token";
import { airdropIfRequired } from "@solana-developers/helpers";
import { BackyardPrograms } from "../target/types/backyard_programs";
import dotenv from 'dotenv';
import { ASSOCIATED_PROGRAM_ID } from "@coral-xyz/anchor/dist/cjs/utils/token";

dotenv.config();

describe("backyard-programs", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const connection = provider.connection;
  const secret = JSON.parse(process.env.MASTER_WALLET_PRIVATE_KEY!);
  const protocolOwner = Keypair.fromSecretKey(Uint8Array.from(secret));
  const program = anchor.workspace.BackyardPrograms as Program<BackyardPrograms>;
  const vaultId = Keypair.generate().publicKey;
  const user = Keypair.generate();
  let vaultPda: PublicKey;
  let lpMint: PublicKey;
  let tokenMint: PublicKey;

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

  it("creates a new vault PDA and lp token", async () => {
    const tx = await program.methods
      .createVault(vaultId)
      .accounts({})
      .signers([protocolOwner])
      .rpc();

    expect(tx).not.toBeNull();

    const vaultAccount = await program.account.vault.fetch(vaultPda);

    expect(vaultAccount.vaultId.toBase58()).toEqual(vaultId.toBase58());

    const lpTokenKeypair = Keypair.generate();

    const extensions = [ExtensionType.NonTransferable];
    const mintLen = getMintLen(extensions);
    const lamports = await connection.getMinimumBalanceForRentExemption(mintLen);

    const createAccountIx = SystemProgram.createAccount({
      fromPubkey: protocolOwner.publicKey,
      newAccountPubkey: lpTokenKeypair.publicKey,
      space: mintLen,
      lamports,
      programId: TOKEN_2022_PROGRAM_ID,
    });

    const initializeNonTransferableIx = createInitializeNonTransferableMintInstruction(
      lpTokenKeypair.publicKey,
      TOKEN_2022_PROGRAM_ID
    );

    const initializeMintIx = createInitializeMint2Instruction(
      lpTokenKeypair.publicKey,
      6,
      vaultPda,
      vaultPda,
      TOKEN_2022_PROGRAM_ID
    );

    const setupTx = new Transaction().add(
      createAccountIx,
      initializeNonTransferableIx,
      initializeMintIx
    );

    await sendAndConfirmTransaction(
      connection,
      setupTx,
      [protocolOwner, lpTokenKeypair]
    );

    lpMint = lpTokenKeypair.publicKey;
  });

  it("deposit to vault", async () => {
    await airdropIfRequired(
      connection,
      user.publicKey,
      2 * LAMPORTS_PER_SOL,
      1 * LAMPORTS_PER_SOL,
    );
    const mint = await createMint(
      connection,
      user,
      user.publicKey,
      null,
      6,
      Keypair.generate(),
      null,
      TOKEN_PROGRAM_ID
    );
    tokenMint = mint;

    const userTokenAccount = await createAssociatedTokenAccount(
      connection,
      user,
      tokenMint,
      user.publicKey,
      null,
      TOKEN_PROGRAM_ID
    );
    const amount = new anchor.BN(100_000_000);

    await mintTo(
      connection,
      user,
      tokenMint,
      userTokenAccount,
      user.publicKey,
      amount.toNumber(),
      [],
      null,
      TOKEN_PROGRAM_ID
    );

    await createAssociatedTokenAccount(
      connection,
      protocolOwner,
      tokenMint,
      vaultPda,
      null,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_PROGRAM_ID,
      true,
    );

    const tx = await program.methods
      .deposit(vaultId, amount)
      .accounts({
        signer: user.publicKey,
        inputToken: tokenMint,
        tokenProgram: TOKEN_PROGRAM_ID,
        tokenProgram2022: TOKEN_2022_PROGRAM_ID,
        lpToken: lpMint,
      })
      .signers([user])
      .rpc();

    expect(tx).not.toBeNull();

    const vaultTokenAccount = getAssociatedTokenAddressSync(
      tokenMint,
      vaultPda,
      true,
      TOKEN_PROGRAM_ID
    );

    const tokenBalance = await connection.getTokenAccountBalance(vaultTokenAccount);
    expect(tokenBalance.value.amount).toEqual(amount.toString());

    const userLpAccount = getAssociatedTokenAddressSync(
      lpMint,
      user.publicKey,
      true,
      TOKEN_2022_PROGRAM_ID
    );

    const lpBalance = await connection.getTokenAccountBalance(userLpAccount);
    expect(lpBalance.value.amount).toEqual(amount.toString());
  });

  it("burn LP and withdraw tokens", async () => {
    const amount = new anchor.BN(100_000_000);

    const txBurn = await program.methods
      .withdraw(vaultId, amount)
      .accounts({
        signer: user.publicKey,
        outputToken: tokenMint,
        lpToken: lpMint,
        tokenProgram: TOKEN_PROGRAM_ID,
        tokenProgram2022: TOKEN_2022_PROGRAM_ID,
      })
      .signers([user])
      .rpc();

    expect(txBurn).not.toBeNull();

    const userLpAccount = getAssociatedTokenAddressSync(
      lpMint,
      user.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID
    );

    const lpBalanceAfter = await connection.getTokenAccountBalance(userLpAccount);
    expect(lpBalanceAfter.value.amount).toEqual("0");

    const userTokenAccount = getAssociatedTokenAddressSync(
      tokenMint,
      user.publicKey,
      true,
      TOKEN_PROGRAM_ID
    );

    const userBalanceAfter = await connection.getTokenAccountBalance(userTokenAccount);
    expect(userBalanceAfter.value.amount).toEqual(amount.toString());
  });

});
