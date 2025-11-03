import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import {
  ComputeBudgetProgram,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  sendAndConfirmTransaction,
  SystemProgram,
  SYSVAR_INSTRUCTIONS_PUBKEY,
  Transaction,
  TransactionMessage,
  VersionedTransaction,
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
} from "@jup-ag/lend/earn";
import { describe, it, expect, beforeAll } from 'vitest';
import { getKaminoDepositContext, getKaminoWithdrawContext } from "./helpers/kamino-helpers";

dotenv.config();

describe("backyard-programs", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const connection = provider.connection;
  const secret = JSON.parse(process.env.MASTER_WALLET_PRIVATE_KEY!);
  const protocolOwner = Keypair.fromSecretKey(Uint8Array.from(secret));
  const program = anchor.workspace
    .BackyardPrograms as Program<BackyardPrograms>;
  const jupiterVaultId = Keypair.generate().publicKey;
  const kaminoVaultId = Keypair.generate().publicKey;

  const secretUser = JSON.parse(process.env.USER_PRIVATE_KEY!);
  const user = Keypair.fromSecretKey(Uint8Array.from(secretUser));
  const usdc = new anchor.web3.PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");

  let jupiterVaultPda: PublicKey;
  let internalLpJupiter: PublicKey;

  let kaminoVaultPda: PublicKey;
  let internalLpKamino: PublicKey;

  beforeAll(async () => {
    await airdropIfRequired(
      connection,
      protocolOwner.publicKey,
      2 * LAMPORTS_PER_SOL,
      1 * LAMPORTS_PER_SOL
    );

    jupiterVaultPda = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), jupiterVaultId.toBuffer()],
      program.programId
    )[0];

    kaminoVaultPda = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), kaminoVaultId.toBuffer()],
      program.programId
    )[0];
  });

  it("creates new lp token and vault PDA for Jupiter", async () => {
    const depositContext = await getDepositContext({
      asset: usdc,
      signer: user.publicKey,
      connection,
    });

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
      jupiterVaultPda,
      jupiterVaultPda,
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

    internalLpJupiter = lpTokenKeypair.publicKey;

    const tx = await program.methods
      .createVault(jupiterVaultId)
      .accounts({
        token: usdc,
        internalLp: internalLpJupiter,
        externalLp: depositContext.fTokenMint,
        tokenProgram: TOKEN_PROGRAM_ID,
        tokenProgram2022: TOKEN_2022_PROGRAM_ID
      })
      .signers([protocolOwner])
      .rpc();

    expect(tx).not.toBeNull();

    const vaultAccount = await program.account.vault.fetch(jupiterVaultPda);

    expect(vaultAccount.vaultId.toBase58()).toEqual(jupiterVaultId.toBase58());
  });

  it("deposit to Jupiter vault", async () => {
    await airdropIfRequired(
      connection,
      user.publicKey,
      2 * LAMPORTS_PER_SOL,
      1 * LAMPORTS_PER_SOL
    );

    const amount = new anchor.BN(100_000_000);

    const depositContext = await getDepositContext({
      asset: usdc,
      signer: user.publicKey,
      connection,
    });

    await getOrCreateAssociatedTokenAccount(
      connection,
      user,
      usdc,
      jupiterVaultPda,
      true,
      undefined,
      undefined,
      TOKEN_PROGRAM_ID
    );
    await getOrCreateAssociatedTokenAccount(
      connection,
      user,
      depositContext.fTokenMint,
      jupiterVaultPda,
      true,
      undefined,
      undefined,
      TOKEN_PROGRAM_ID
    );

    const computeBudgetIx = ComputeBudgetProgram.setComputeUnitLimit({
      units: 600_000,
    });

    const tx = await program.methods
      .deposit(jupiterVaultId, amount)
      .accounts({
        signer: user.publicKey,
        inputToken: usdc,
        tokenProgram: TOKEN_PROGRAM_ID,
        tokenProgram2022: TOKEN_2022_PROGRAM_ID,
        lpToken: internalLpJupiter,
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
      jupiterVaultPda,
      true,
      TOKEN_PROGRAM_ID
    );

    const vaultLpBalance = await connection.getTokenAccountBalance(vaultLpAccount);

    const userLpAccount = getAssociatedTokenAddressSync(
      internalLpJupiter,
      user.publicKey,
      true,
      TOKEN_2022_PROGRAM_ID
    );

    const userLpBalance = await connection.getTokenAccountBalance(userLpAccount);
    expect(Number(userLpBalance.value.amount)).toBeGreaterThan(0);
    expect(vaultLpBalance.value.amount).toEqual(userLpBalance.value.amount);
  });

  it("burn LP and withdraw tokens from Jupiter", async () => {
    const userLpAccount = getAssociatedTokenAddressSync(
      internalLpJupiter,
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
      jupiterVaultPda,
      true,
      TOKEN_PROGRAM_ID
    );
    const vaultLpBalanceBefore = await connection.getTokenAccountBalance(vaultLpAccount);
    console.log("vaultLpBalanceBefore: ", vaultLpBalanceBefore.value.uiAmount);

    const computeBudgetIx = ComputeBudgetProgram.setComputeUnitLimit({
      units: 600_000,
    });

    const txBurn = await program.methods
      .withdraw(jupiterVaultId, amount)
      .accounts({
        signer: user.publicKey,
        outputToken: usdc,
        lpToken: internalLpJupiter,
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

  it("creates new lp token and vault PDA for Kamino", async () => {
    const depositContext = await getKaminoDepositContext({
      asset: usdc,
      signer: user.publicKey,
      connection,
    });

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
      kaminoVaultPda,
      kaminoVaultPda,
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

    internalLpKamino = lpTokenKeypair.publicKey;

    const tx = await program.methods
      .createVault(kaminoVaultId)
      .accounts({
        token: usdc,
        internalLp: internalLpKamino,
        externalLp: depositContext.sharesMint,
        tokenProgram: TOKEN_PROGRAM_ID,
        tokenProgram2022: TOKEN_2022_PROGRAM_ID
      })
      .signers([protocolOwner])
      .rpc();

    expect(tx).not.toBeNull();

    const vaultAccount = await program.account.vault.fetch(kaminoVaultPda);

    expect(vaultAccount.vaultId.toBase58()).toEqual(kaminoVaultId.toBase58());
  });

  it("deposit USDC to Kamino vault", async () => {

    const amount = new anchor.BN(100000000);

    const depositContext = await getKaminoDepositContext({
      connection,
      asset: usdc,
      signer: user.publicKey,
    });

    const userUsdcAccount = getAssociatedTokenAddressSync(
      usdc,
      user.publicKey,
      false,
      TOKEN_PROGRAM_ID
    );

    const userInputBalanceBefore = await connection.getTokenAccountBalance(userUsdcAccount);
    console.log("userInputBalanceBefore: ", userInputBalanceBefore.value.uiAmount);

    await getOrCreateAssociatedTokenAccount(
      connection,
      user,
      usdc,
      kaminoVaultPda,
      true,
      undefined,
      undefined,
      TOKEN_PROGRAM_ID
    );

    await getOrCreateAssociatedTokenAccount(
      connection,
      user,
      depositContext.sharesMint,
      kaminoVaultPda,
      true,
      undefined,
      undefined,
      TOKEN_PROGRAM_ID
    );

    const computeBudgetIx = ComputeBudgetProgram.setComputeUnitLimit({
      units: 600_000,
    });

    const tx = await program.methods
      .kaminoVaultDeposit(kaminoVaultId, amount)
      .accounts({
        signer: user.publicKey,
        inputToken: usdc,
        vaultState: depositContext.vaultState,
        tokenVault: depositContext.tokenVault,
        baseVaultAuthority: depositContext.baseVaultAuthority,
        sharesMint: depositContext.sharesMint,
        lpToken: internalLpKamino,
        eventAuthority: depositContext.eventAuthority,
        klendProgram: depositContext.klendProgram,
        tokenProgram: TOKEN_PROGRAM_ID,
        tokenProgram2022: TOKEN_2022_PROGRAM_ID,
      })
      .remainingAccounts(depositContext.remainingAccounts)
      .preInstructions([computeBudgetIx])
      .signers([user])
      .rpc();

    expect(tx).not.toBeNull();

    const userInputBalanceAfter = await connection.getTokenAccountBalance(userUsdcAccount);
    console.log("userInputBalanceAfter: ", userInputBalanceAfter.value.uiAmount);

    const vaultLpAccount = getAssociatedTokenAddressSync(
      depositContext.sharesMint,
      kaminoVaultPda,
      true,
      TOKEN_PROGRAM_ID
    );

    const vaultLpBalance = await connection.getTokenAccountBalance(vaultLpAccount);

    const userLpAccount = getAssociatedTokenAddressSync(
      internalLpKamino,
      user.publicKey,
      true,
      TOKEN_2022_PROGRAM_ID
    );
    const userLpBalance = await connection.getTokenAccountBalance(userLpAccount);
    expect(Number(userLpBalance.value.amount)).toBeGreaterThan(0);
    expect(vaultLpBalance.value.amount).toEqual(userLpBalance.value.amount);
  });

  it("withdraw USDC from Kamino vault", async () => {
    const withdrawContext = await getKaminoWithdrawContext({
      connection,
      asset: usdc,
      signer: user.publicKey,
    });

    const userLpAccount = getAssociatedTokenAddressSync(
      internalLpKamino,
      user.publicKey,
      true,
      TOKEN_2022_PROGRAM_ID
    );

    const userLpBalanceBefore = await connection.getTokenAccountBalance(userLpAccount);
    console.log("User LP balance before:", userLpBalanceBefore.value.uiAmount);

    const lpAmountToWithdraw = new anchor.BN(50_000_000);

    const userUsdcAccount = getAssociatedTokenAddressSync(
      usdc,
      user.publicKey,
      false,
      TOKEN_PROGRAM_ID
    );

    const userUsdcBalanceBefore = await connection.getTokenAccountBalance(userUsdcAccount);
    console.log("User USDC balance before:", userUsdcBalanceBefore.value.uiAmount);

    await getOrCreateAssociatedTokenAccount(
      connection,
      user,
      usdc,
      kaminoVaultPda,
      true,
      undefined,
      undefined,
      TOKEN_PROGRAM_ID
    );

    await getOrCreateAssociatedTokenAccount(
      connection,
      user,
      withdrawContext.sharesMint,
      kaminoVaultPda,
      true,
      undefined,
      undefined,
      TOKEN_PROGRAM_ID
    );

    const computeBudgetIx = ComputeBudgetProgram.setComputeUnitLimit({
      units: 800_000,
    });

    const instruction = await program.methods
      .kaminoVaultWithdraw(kaminoVaultId, lpAmountToWithdraw)
      .accounts({
        signer: user.publicKey,
        outputToken: usdc,
        lpToken: internalLpKamino,
        vaultState: withdrawContext.vaultState,
        reserve: withdrawContext.reserve,
        tokenVault: withdrawContext.tokenVault,
        baseVaultAuthority: withdrawContext.baseVaultAuthority,
        eventAuthority: withdrawContext.eventAuthority,
        sharesMint: withdrawContext.sharesMint,
        lendingMarket: withdrawContext.lendingMarket,
        lendingMarketAuthority: withdrawContext.lendingMarketAuthority,
        reserveLiquiditySupply: withdrawContext.reserveLiquiditySupply,
        reserveCollateralMint: withdrawContext.reserveCollateralMint,
        ctokenVault: withdrawContext.ctokenVault,
        klendProgram: withdrawContext.klendProgram,
        tokenProgram: TOKEN_PROGRAM_ID,
        tokenProgram2022: TOKEN_2022_PROGRAM_ID,
      })
      .remainingAccounts(withdrawContext.remainingAccounts)
      .instruction();

    const messageV0 = new TransactionMessage({
      payerKey: user.publicKey,
      recentBlockhash: (await connection.getLatestBlockhash()).blockhash,
      instructions: [computeBudgetIx, instruction],
    }).compileToV0Message();

    const transaction = new VersionedTransaction(messageV0);
    transaction.sign([user]);

    const tx = await connection.sendTransaction(transaction);

    expect(tx).not.toBeNull();

    const userLpBalanceAfter = await connection.getTokenAccountBalance(userLpAccount);
    console.log("User LP balance after:", userLpBalanceAfter.value.uiAmount);

    const userUsdcBalanceAfter = await connection.getTokenAccountBalance(userUsdcAccount);
    console.log("User USDC balance after:", userUsdcBalanceAfter.value.uiAmount);

    expect(Number(userUsdcBalanceAfter.value.amount)).toBeGreaterThan(
      Number(userUsdcBalanceBefore.value.amount)
    );
  });
});
