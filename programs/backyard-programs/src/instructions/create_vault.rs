use crate::{errors::ErrorCode, Vault, MASTER_WALLET};
use anchor_lang::prelude::*;

#[derive(Accounts)]
#[instruction(protocol_index: u8, vault_id: Pubkey)]
pub struct CreateVault<'info> {
    #[account(
        mut,
        address = MASTER_WALLET @ ErrorCode::NotOwner
    )]
    pub master: Signer<'info>,

    #[account(
        init,
        payer = master,
        space = 8 + Vault::INIT_SPACE,
        seeds = [b"vault", protocol_index.to_le_bytes().as_ref(), vault_id.as_ref()],
        bump,
    )]
    pub vault: Account<'info, Vault>,

    pub system_program: Program<'info, System>,
}

pub fn create_vault(ctx: Context<CreateVault>, protocol_index: u8, vault_id: Pubkey) -> Result<()> {
    let vault = &mut ctx.accounts.vault;

    vault.protocol_index = protocol_index;
    vault.vault_id = vault_id;
    vault.bump = ctx.bumps.vault;
    Ok(())
}
