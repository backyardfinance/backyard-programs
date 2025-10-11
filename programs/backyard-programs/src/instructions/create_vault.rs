use crate::{errors::ErrorCode, Vault, PROTOCOL_OWNER};
use anchor_lang::prelude::*;

#[derive(Accounts)]
#[instruction(vault_id: Pubkey)]
pub struct CreateVault<'info> {
    #[account(
        mut,
        address = PROTOCOL_OWNER @ ErrorCode::NotOwner
    )]
    pub protocol_owner: Signer<'info>,

    #[account(
        init,
        payer = protocol_owner,
        space = 8 + Vault::INIT_SPACE,
        seeds = [b"vault", vault_id.as_ref()],
        bump,
    )]
    pub vault: Account<'info, Vault>,

    pub system_program: Program<'info, System>,
}

pub fn create_vault(ctx: Context<CreateVault>, vault_id: Pubkey) -> Result<()> {
    let vault = &mut ctx.accounts.vault;
    vault.vault_id = vault_id;
    vault.bump = ctx.bumps.vault;

    Ok(())
}
