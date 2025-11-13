use crate::{errors::ErrorCode, Vault, MASTER_WALLET};
use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenInterface};

#[derive(Accounts)]
#[instruction(vault_id: Pubkey)]
pub struct CreateVault<'info> {
    #[account(
        mut,
        address = MASTER_WALLET @ ErrorCode::NotOwner
    )]
    pub master: Signer<'info>,

    #[account(mint::token_program = token_program)]
    pub token: Box<InterfaceAccount<'info, Mint>>,

    #[account(mint::token_program = token_program_2022)]
    pub internal_lp: Box<InterfaceAccount<'info, Mint>>,

    #[account(mint::token_program = token_program)]
    pub external_lp: Box<InterfaceAccount<'info, Mint>>,

    #[account(
        init,
        payer = master,
        space = 8 + Vault::INIT_SPACE,
        seeds = [b"vault", vault_id.as_ref()],
        bump,
    )]
    pub vault: Box<Account<'info, Vault>>,

    pub token_program: Interface<'info, TokenInterface>,
    pub token_program_2022: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

pub fn create_vault(ctx: Context<CreateVault>, vault_id: Pubkey) -> Result<()> {
    let vault = &mut ctx.accounts.vault;

    vault.vault_id = vault_id;
    vault.token = ctx.accounts.token.key();
    vault.external_lp = ctx.accounts.external_lp.key();
    vault.internal_lp = ctx.accounts.internal_lp.key();
    vault.bump = ctx.bumps.vault;
    Ok(())
}
