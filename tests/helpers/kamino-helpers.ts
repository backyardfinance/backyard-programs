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
    reserves: [
      { pubkey: new PublicKey('Ga4rZytCpq1unD4DbEJ5bkHeUz9g3oh9AAFEi6vSauXp'), isWritable: true },
      { pubkey: new PublicKey('D6q6wuQSrifJKZYpR1M8R4YawnLDtDsMmWM1NbBmgJ59'), isWritable: true },
      { pubkey: new PublicKey('DxXdAyU3kCjnyggvHmY5nAwg5cRbbmdyX3npfDMjjMek'), isWritable: false },
      { pubkey: new PublicKey('7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF'), isWritable: false },
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
}): Promise<KaminoDepositContext> {
  return getKaminoDepositContext(params);
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