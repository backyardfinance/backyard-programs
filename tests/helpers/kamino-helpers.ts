import { AccountMeta, Connection, PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";

export const KAMINO_PROGRAM_ID = new PublicKey("KvauGMspG5k6rtzrqqn7WNn3oZdyKqLKwK2XWQ8FLjd");
export const KLEND_PROGRAM_ID = new PublicKey("KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD");

export const KNOWN_VAULTS = {
  USDC: {
    vaultState: new PublicKey("HDsayqAsDWy3QvANGqh2yNraqcD8Fnjgh73Mhb3WRS5E"),
    tokenMint: new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"),
    tokenVault: new PublicKey("CKTEDx5z19CntAB9B66AxuS98S1NuCgMvfpsew7TQwi"),
    baseVaultAuthority: new PublicKey("AyY6VCkHfTWdFs7SqBbu6AnCqLUhgzVHBzW3WcJu5Jc8"),
    sharesMint: new PublicKey("7D8C5pDFxug58L9zkwK7bCiDg4kD4AygzbcZUmf5usHS"),
    eventAuthority: new PublicKey("24tHwQyJJ9akVXxnvkekGfAoeUJXXS7mE6kQNioNySsK"),
    lendingMarket: new PublicKey("7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF"), // #17 - Kamino Lending JLP Market
    lendingMarketAuthority: new PublicKey("9DrvZvyWh1HuAoZxvYWMvkf2XCzryCpGgHqrMjyDWpmo"), // #18 - Kamino Reserve 2
    mainReserve: {
      pubkey: new PublicKey('D6q6wuQSrifJKZYpR1M8R4YawnLDtDsMmWM1NbBmgJ59'), // #15 - Kamino Reserve (USDC) State
      ctokenVault: new PublicKey('CZg8x8oqB7FYUfURq15F5AcjRTymcXsc8ann76CrpJrf'), // #16
      liquiditySupply: new PublicKey('Bgq7trRgVMeq33yt235zM2onQ4bRDBsY5EWiTetF4qw6'), // #19 - Kamino Reserve Liquidity (USDC) Supply
      collateralMint: new PublicKey('B8V6WVjPxW1UGwVDfxH2d2r8SyT4cqn7dQRK6XneVa7D'), // #20 - Kamino Reserve Collateral (USDC) Token
    },
    reserves: [
      { pubkey: new PublicKey('Ga4rZytCpq1unD4DbEJ5bkHeUz9g3oh9AAFEi6vSauXp'), isWritable: true }, // #25
      { pubkey: new PublicKey('D6q6wuQSrifJKZYpR1M8R4YawnLDtDsMmWM1NbBmgJ59'), isWritable: true }, // #26
      { pubkey: new PublicKey('DxXdAyU3kCjnyggvHmY5nAwg5cRbbmdyX3npfDMjjMek'), isWritable: false }, // #27 - Kamino Lending JLP Market
      { pubkey: new PublicKey('7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF'), isWritable: false }, // #28 - Kamino Lending Main Market
    ],
  },
};

export interface KaminoDepositContext {
  vaultState: PublicKey;
  tokenVault: PublicKey;
  baseVaultAuthority: PublicKey;
  sharesMint: PublicKey;
  tokenMint: PublicKey;
  eventAuthority: PublicKey;
  kaminoProgram: PublicKey;
  klendProgram: PublicKey;
  tokenProgram: PublicKey;
  remainingAccounts: AccountMeta[];
}

export interface KaminoWithdrawContext extends KaminoDepositContext {
  lendingMarket: PublicKey;
  lendingMarketAuthority: PublicKey;
  reserve: PublicKey;
  ctokenVault: PublicKey;
  reserveLiquiditySupply: PublicKey;
  reserveCollateralMint: PublicKey;
}

export async function getKaminoDepositContext(params: {
  connection: Connection;
  asset: PublicKey;
  signer: PublicKey;
}): Promise<KaminoDepositContext> {
  const { asset } = params;

  let vaultInfo: typeof KNOWN_VAULTS.USDC | null = null;

  for (const [name, vault] of Object.entries(KNOWN_VAULTS)) {
    if (vault.tokenMint.equals(asset)) {
      vaultInfo = vault;
      break;
    }
  }

  if (!vaultInfo) {
    throw new Error(`No Kamino vault found for asset: ${asset.toBase58()}`);
  }

  return {
    vaultState: vaultInfo.vaultState,
    tokenVault: vaultInfo.tokenVault,
    baseVaultAuthority: vaultInfo.baseVaultAuthority,
    sharesMint: vaultInfo.sharesMint,
    tokenMint: vaultInfo.tokenMint,
    eventAuthority: vaultInfo.eventAuthority,
    kaminoProgram: KAMINO_PROGRAM_ID,
    klendProgram: KLEND_PROGRAM_ID,
    tokenProgram: TOKEN_PROGRAM_ID,
    remainingAccounts: vaultInfo.reserves.map(r => ({
      pubkey: r.pubkey,
      isWritable: r.isWritable,
      isSigner: false,
    })),
  };
}

export async function getKaminoWithdrawContext(params: {
  connection: Connection;
  asset: PublicKey;
  signer: PublicKey;
}): Promise<KaminoWithdrawContext> {
  const { asset } = params;

  let vaultInfo: typeof KNOWN_VAULTS.USDC | null = null;

  for (const [name, vault] of Object.entries(KNOWN_VAULTS)) {
    if (vault.tokenMint.equals(asset)) {
      vaultInfo = vault;
      break;
    }
  }

  if (!vaultInfo) {
    throw new Error(`No Kamino vault found for asset: ${asset.toBase58()}`);
  }

  return {
    vaultState: vaultInfo.vaultState,
    tokenVault: vaultInfo.tokenVault,
    baseVaultAuthority: vaultInfo.baseVaultAuthority,
    sharesMint: vaultInfo.sharesMint,
    tokenMint: vaultInfo.tokenMint,
    eventAuthority: vaultInfo.eventAuthority,
    kaminoProgram: KAMINO_PROGRAM_ID,
    klendProgram: KLEND_PROGRAM_ID,
    tokenProgram: TOKEN_PROGRAM_ID,
    lendingMarket: vaultInfo.lendingMarket,
    lendingMarketAuthority: vaultInfo.lendingMarketAuthority,
    reserve: vaultInfo.mainReserve.pubkey,
    ctokenVault: vaultInfo.mainReserve.ctokenVault,
    reserveLiquiditySupply: vaultInfo.mainReserve.liquiditySupply,
    reserveCollateralMint: vaultInfo.mainReserve.collateralMint,
    remainingAccounts: vaultInfo.reserves.map(r => ({
      pubkey: r.pubkey,
      isWritable: r.isWritable,
      isSigner: false,
    })),
  };
}

export async function getKaminoVaults() {
  return Object.entries(KNOWN_VAULTS).map(([name, vault]) => ({
    name,
    ...vault,
  }));
}

export async function getKaminoVaultInfo(
  connection: Connection,
  vaultState: PublicKey
) {
  const accountInfo = await connection.getAccountInfo(vaultState);

  if (!accountInfo) {
    throw new Error(`Vault state not found: ${vaultState.toBase58()}`);
  }

  const data = accountInfo.data;

  const baseVaultAuthority = new PublicKey(data.slice(32, 64));
  const tokenMint = new PublicKey(data.slice(96, 128));
  const tokenVault = new PublicKey(data.slice(160, 192));
  const sharesMint = new PublicKey(data.slice(224, 256));

  return {
    vaultState,
    baseVaultAuthority,
    tokenMint,
    tokenVault,
    sharesMint,
  };
}