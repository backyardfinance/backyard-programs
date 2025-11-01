use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct Vault {
    pub vault_id: Pubkey,
    pub token: Pubkey,
    pub internal_lp: Pubkey,
    pub external_lp: Pubkey,
    pub bump: u8,
}
