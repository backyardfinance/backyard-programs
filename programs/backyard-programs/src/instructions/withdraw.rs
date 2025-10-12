use crate::{errors::ErrorCode, Vault};
use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{
        burn_checked, transfer_checked, BurnChecked, Mint, TokenAccount, TokenInterface,
        TransferChecked,
    },
};

#[derive(Accounts)]
#[instruction(vault_id: Pubkey)]
pub struct BurnLpAndWithdraw<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(mint::token_program = token_program_2022)]
    pub token: InterfaceAccount<'info, Mint>,

    #[account(
        init_if_needed,
        payer = user,
        associated_token::mint = token,
        associated_token::authority = user,
        associated_token::token_program = token_program_2022,
    )]
    pub user_token_account: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        associated_token::mint = token,
        associated_token::authority = vault,
        associated_token::token_program = token_program_2022,
    )]
    pub vault_token_account: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        mint::authority = vault,
        mint::freeze_authority = vault,
        mint::token_program = token_program_2022,
    )]
    pub lp_mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        associated_token::mint = lp_mint,
        associated_token::authority = user,
        associated_token::token_program = token_program_2022,
    )]
    pub user_lp_token_account: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [b"vault", vault_id.as_ref()],
        bump = vault.bump,
    )]
    pub vault: Account<'info, Vault>,

    pub associated_token_program: Program<'info, AssociatedToken>,
    pub token_program_2022: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

pub fn burn_lp_and_withdraw(
    ctx: Context<BurnLpAndWithdraw>,
    vault_id: Pubkey,
    amount: u64,
) -> Result<()> {
    let vault_seeds: &[&[u8]] = &[b"vault", vault_id.as_ref(), &[ctx.accounts.vault.bump]];

    require!(amount > 0, ErrorCode::InvalidAmount);

    burn_checked(
        CpiContext::new(
            ctx.accounts.token_program_2022.to_account_info(),
            BurnChecked {
                mint: ctx.accounts.lp_mint.to_account_info(),
                from: ctx.accounts.user_lp_token_account.to_account_info(),
                authority: ctx.accounts.user.to_account_info(),
            },
        ),
        amount,
        ctx.accounts.lp_mint.decimals,
    )?;

    transfer_checked(
        CpiContext::new_with_signer(
            ctx.accounts.token_program_2022.to_account_info(),
            TransferChecked {
                from: ctx.accounts.vault_token_account.to_account_info(),
                mint: ctx.accounts.token.to_account_info(),
                to: ctx.accounts.user_token_account.to_account_info(),
                authority: ctx.accounts.vault.to_account_info(),
            },
            &[vault_seeds],
        ),
        amount,
        ctx.accounts.token.decimals,
    )?;

    Ok(())
}
