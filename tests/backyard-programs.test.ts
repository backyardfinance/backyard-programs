import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import {
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
} from "@solana/web3.js";
import {
  createAssociatedTokenAccount,
  createMint,
  getAssociatedTokenAddressSync,
  mintTo,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  unpackMint,
} from "@solana/spl-token";
import { airdropIfRequired } from "@solana-developers/helpers";
import { BackyardPrograms } from "../target/types/backyard_programs";
import dotenv from 'dotenv';

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

  it("creates a new LP mint for the vault", async () => {
    const mintAccount = Keypair.generate();
    const decimals = 6;
    lpMint = mintAccount.publicKey;

    const tx = await program.methods
      .createLp(vaultId, decimals)
      .accounts({
        mintAccount: mintAccount.publicKey,
        tokenProgram2022: TOKEN_2022_PROGRAM_ID,
      })
      .signers([protocolOwner, mintAccount])
      .rpc();

    expect(tx).not.toBeNull();

    const mintInfo = await connection.getAccountInfo(mintAccount.publicKey);
    expect(mintInfo).not.toBeNull();

    const mint = unpackMint(mintAccount.publicKey, mintInfo!, TOKEN_2022_PROGRAM_ID);

    expect(mint.decimals).toBe(decimals);
    expect(mint.mintAuthority?.toBase58()).toBe(vaultPda.toBase58());
    expect(mint.freezeAuthority?.toBase58()).toBe(vaultPda.toBase58());
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
      true,
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
