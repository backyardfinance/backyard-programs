use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct Vault {
    pub protocol_index: u8,
    pub vault_id: Pubkey,
    pub bump: u8,
}
