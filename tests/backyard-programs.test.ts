import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import {
  ComputeBudgetProgram,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  sendAndConfirmTransaction,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import {
  createInitializeMint2Instruction,
  createInitializeNonTransferableMintInstruction,
  ExtensionType,
  getAssociatedTokenAddressSync,
  getMintLen,
  getOrCreateAssociatedTokenAccount,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { airdropIfRequired } from "@solana-developers/helpers";
import { BackyardPrograms } from "../target/types/backyard_programs";

import dotenv from 'dotenv';
import { utils } from "@coral-xyz/anchor";
import {
  getDepositContext,
  getWithdrawContext,
  getLendingTokens,
} from "@jup-ag/lend/earn";
import { describe, it, expect, beforeAll } from 'vitest';

dotenv.config();

describe("backyard-programs", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const connection = provider.connection;
  const secret = JSON.parse(process.env.MASTER_WALLET_PRIVATE_KEY!);
  const protocolOwner = Keypair.fromSecretKey(Uint8Array.from(secret));
  const program = anchor.workspace
    .BackyardPrograms as Program<BackyardPrograms>;
  const vaultId = Keypair.generate().publicKey;

  const secretUser = JSON.parse(process.env.USER_PRIVATE_KEY!);
  const user = Keypair.fromSecretKey(Uint8Array.from(secretUser));
  const usdc = new anchor.web3.PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");

  let vaultPda: PublicKey;
  let lpMint: PublicKey;

  beforeAll(async () => {
    await airdropIfRequired(
      connection,
      protocolOwner.publicKey,
      2 * LAMPORTS_PER_SOL,
      1 * LAMPORTS_PER_SOL
    );

    vaultPda = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), vaultId.toBuffer()],
      program.programId
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
    const lamports = await connection.getMinimumBalanceForRentExemption(
      mintLen
    );

    const createAccountIx = SystemProgram.createAccount({
      fromPubkey: protocolOwner.publicKey,
      newAccountPubkey: lpTokenKeypair.publicKey,
      space: mintLen,
      lamports,
      programId: TOKEN_2022_PROGRAM_ID,
    });

    const initializeNonTransferableIx =
      createInitializeNonTransferableMintInstruction(
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

    await sendAndConfirmTransaction(connection, setupTx, [
      protocolOwner,
      lpTokenKeypair,
    ]);

    lpMint = lpTokenKeypair.publicKey;
  });

  it("deposit to vault", async () => {
    await airdropIfRequired(
      connection,
      user.publicKey,
      2 * LAMPORTS_PER_SOL,
      1 * LAMPORTS_PER_SOL
    );

    const amount = new anchor.BN(100_000_000);

    const allTokens = await getLendingTokens({ connection });

    console.log({ allTokens });

    const depositContext = await getDepositContext({
      asset: usdc,
      signer: user.publicKey,
      connection,
    });

    await getOrCreateAssociatedTokenAccount(
      connection,
      user,
      usdc,
      vaultPda,
      true,
      undefined,
      undefined,
      TOKEN_PROGRAM_ID
    );
    await getOrCreateAssociatedTokenAccount(
      connection,
      user,
      depositContext.fTokenMint,
      vaultPda,
      true,
      undefined,
      undefined,
      TOKEN_PROGRAM_ID
    );

    const computeBudgetIx = ComputeBudgetProgram.setComputeUnitLimit({
      units: 600_000,
    });

    const tx = await program.methods
      .deposit(vaultId, amount)
      .accounts({
        signer: user.publicKey,
        inputToken: usdc,
        tokenProgram: TOKEN_PROGRAM_ID,
        tokenProgram2022: TOKEN_2022_PROGRAM_ID,
        lpToken: lpMint,
        fTokenMint: depositContext.fTokenMint,
        jupiterVault: depositContext.vault,
        lending: depositContext.lending,
        lendingAdmin: depositContext.lendingAdmin,
        rewardsRateModel: depositContext.rewardsRateModel,
        lendingSupplyPositionOnLiquidity: depositContext.lendingSupplyPositionOnLiquidity,
        liquidity: depositContext.liquidity,
        liquidityProgram: depositContext.liquidityProgram,
        rateModel: depositContext.rateModel,
        supplyTokenReservesLiquidity: depositContext.supplyTokenReservesLiquidity,
      })
      .preInstructions([computeBudgetIx])
      .signers([user])
      .rpc();

    expect(tx).not.toBeNull();

    const vaultLpAccount = getAssociatedTokenAddressSync(
      depositContext.fTokenMint,
      vaultPda,
      true,
      TOKEN_PROGRAM_ID
    );

    const vaultLpBalance = await connection.getTokenAccountBalance(vaultLpAccount);

    const userLpAccount = getAssociatedTokenAddressSync(
      lpMint,
      user.publicKey,
      true,
      TOKEN_2022_PROGRAM_ID
    );

    const userLpBalance = await connection.getTokenAccountBalance(userLpAccount);
    expect(Number(userLpBalance.value.amount)).toBeGreaterThan(0);
    expect(vaultLpBalance.value.amount).toEqual(userLpBalance.value.amount);
  });

  it("burn LP and withdraw tokens", async () => {
    const userLpAccount = getAssociatedTokenAddressSync(
      lpMint,
      user.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID
    );

    const userLpBalance = await connection.getTokenAccountBalance(userLpAccount);
    console.log("userLpBalance: ", userLpBalance.value.uiAmount);
    const amount = new anchor.BN(50_000_000);

    const userOutputAccount = getAssociatedTokenAddressSync(
      usdc,
      user.publicKey,
      false,
      TOKEN_PROGRAM_ID
    );
    const userOutputBalanceBefore = await connection.getTokenAccountBalance(userOutputAccount);
    console.log("userOutputBalanceBefore: ", userOutputBalanceBefore.value.uiAmount);

    const withdrawContext = await getWithdrawContext({
      asset: usdc,
      signer: user.publicKey,
      connection,
    });
    const vaultLpAccount = getAssociatedTokenAddressSync(
      withdrawContext.fTokenMint,
      vaultPda,
      true,
      TOKEN_PROGRAM_ID
    );
    const vaultLpBalanceBefore = await connection.getTokenAccountBalance(vaultLpAccount);
    console.log("vaultLpBalanceBefore: ", vaultLpBalanceBefore.value.uiAmount);

    const computeBudgetIx = ComputeBudgetProgram.setComputeUnitLimit({
      units: 600_000,
    });

    const txBurn = await program.methods
      .withdraw(vaultId, amount)
      .accounts({
        signer: user.publicKey,
        outputToken: usdc,
        lpToken: lpMint,
        tokenProgram: TOKEN_PROGRAM_ID,
        tokenProgram2022: TOKEN_2022_PROGRAM_ID,
        fTokenMint: withdrawContext.fTokenMint,
        jupiterVault: withdrawContext.vault,
        lending: withdrawContext.lending,
        lendingAdmin: withdrawContext.lendingAdmin,
        lendingSupplyPositionOnLiquidity: withdrawContext.lendingSupplyPositionOnLiquidity,
        liquidity: withdrawContext.liquidity,
        liquidityProgram: withdrawContext.liquidityProgram,
        rateModel: withdrawContext.rateModel,
        rewardsRateModel: withdrawContext.rewardsRateModel,
        supplyTokenReservesLiquidity: withdrawContext.supplyTokenReservesLiquidity,
        claimAccount: withdrawContext.claimAccount
      })
      .preInstructions([computeBudgetIx])
      .signers([user])
      .rpc();

    expect(txBurn).not.toBeNull();

    const userLpBalanceAfter = await connection.getTokenAccountBalance(userLpAccount);
    console.log("userLpBalanceAfter: ", userLpBalanceAfter.value.uiAmount);
    const userOutputBalanceAfter = await connection.getTokenAccountBalance(userOutputAccount);
    console.log("userOutputBalanceAfter: ", userOutputBalanceAfter.value.uiAmount);
    const vaultLpBalanceAfter = await connection.getTokenAccountBalance(vaultLpAccount);
    console.log("vaultLpBalanceAfter: ", vaultLpBalanceAfter.value.uiAmount);

    const before = Number(userOutputBalanceBefore.value.amount);
    const after = Number(userOutputBalanceAfter.value.amount);

    expect(after).toBeGreaterThan(before);
  });
});
