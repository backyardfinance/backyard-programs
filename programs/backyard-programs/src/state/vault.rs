use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct Vault {
    pub vault_id: Pubkey,
    pub bump: u8,
}
