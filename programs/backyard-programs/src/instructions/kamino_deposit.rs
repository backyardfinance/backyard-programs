use crate::{
    errors::ErrorCode,
    kamino_vault_converted::{
        cpi::{accounts::Deposit, deposit},
        program::KaminoVault,
    },
    Vault,
};
use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{
        mint_to, transfer_checked, Mint, MintTo, TokenAccount, TokenInterface, TransferChecked,
    },
};

#[derive(Accounts)]
#[instruction(vault_id: Pubkey)]
pub struct KaminoVaultDeposit<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,

    #[account(
        mint::token_program = token_program,
        address = vault.token @ ErrorCode::WrongToken
    )]
    pub input_token: Box<InterfaceAccount<'info, Mint>>,

    #[account(
        mut,
        associated_token::mint = input_token,
        associated_token::authority = signer,
        associated_token::token_program = token_program,
    )]
    pub signer_input_ata: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(
      mut,
      associated_token::mint = input_token,
      associated_token::authority = vault,
      associated_token::token_program = token_program,
    )]
    pub vault_input_ata: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(
      mut,
      associated_token::mint = shares_mint,
      associated_token::authority = vault,
      associated_token::token_program = token_program,
    )]
    pub vault_lp_ata: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(
      mut,
      mint::token_program = token_program_2022,
      address = vault.internal_lp @ ErrorCode::WrongToken
    )]
    pub lp_token: Box<InterfaceAccount<'info, Mint>>,

    #[account(
      init_if_needed,
      payer = signer,
      associated_token::mint = lp_token,
      associated_token::authority = signer,
      associated_token::token_program = token_program_2022,
    )]
    pub signer_lp_ata: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(
        mut,
        seeds = [b"vault", vault_id.as_ref()],
        bump = vault.bump,
    )]
    pub vault: Box<Account<'info, Vault>>,

    /// CHECK: Kamino vault state
    #[account(mut)]
    pub vault_state: AccountInfo<'info>,

    #[account(mut)]
    pub token_vault: Box<InterfaceAccount<'info, TokenAccount>>,

    /// CHECK: Kamino base vault authority
    pub base_vault_authority: AccountInfo<'info>,

    /// CHECK: Kamino event authority
    pub event_authority: AccountInfo<'info>,

    #[account(
      mut,
      mint::token_program = token_program,
      address = vault.external_lp @ ErrorCode::WrongToken
    )]
    pub shares_mint: Box<InterfaceAccount<'info, Mint>>,

    /// CHECK: Kamino lend program
    pub klend_program: AccountInfo<'info>,
    pub kamino_vault: Program<'info, KaminoVault>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub token_program: Interface<'info, TokenInterface>,
    pub token_program_2022: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

pub fn kamino_vault_deposit<'info>(
    ctx: Context<'_, '_, '_, 'info, KaminoVaultDeposit<'info>>,
    vault_id: Pubkey,
    amount: u64,
) -> Result<()> {
    let vault_seeds: &[&[u8]] = &[b"vault", vault_id.as_ref(), &[ctx.accounts.vault.bump]];
    let amount_lp_before = ctx.accounts.vault_lp_ata.amount;
    let remaining_accounts = ctx.remaining_accounts.to_vec();

    require!(amount > 0, ErrorCode::InvalidAmount);

    transfer_checked(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            TransferChecked {
                from: ctx.accounts.signer_input_ata.to_account_info(),
                mint: ctx.accounts.input_token.to_account_info(),
                to: ctx.accounts.vault_input_ata.to_account_info(),
                authority: ctx.accounts.signer.to_account_info(),
            },
        ),
        amount,
        ctx.accounts.input_token.decimals,
    )?;

    deposit(
        CpiContext::new_with_signer(
            ctx.accounts.kamino_vault.to_account_info(),
            Deposit {
                user: ctx.accounts.vault.to_account_info(),
                vault_state: ctx.accounts.vault_state.to_account_info(),
                token_vault: ctx.accounts.token_vault.to_account_info(),
                token_mint: ctx.accounts.input_token.to_account_info(),
                base_vault_authority: ctx.accounts.base_vault_authority.to_account_info(),
                shares_mint: ctx.accounts.shares_mint.to_account_info(),
                user_token_ata: ctx.accounts.vault_input_ata.to_account_info(),
                user_shares_ata: ctx.accounts.vault_lp_ata.to_account_info(),
                klend_program: ctx.accounts.klend_program.to_account_info(),
                token_program: ctx.accounts.token_program.to_account_info(),
                shares_token_program: ctx.accounts.token_program.to_account_info(),
                event_authority: ctx.accounts.event_authority.to_account_info(),
                program: ctx.accounts.kamino_vault.to_account_info(),
            },
            &[vault_seeds],
        )
        .with_remaining_accounts(remaining_accounts),
        amount,
    )?;

    ctx.accounts.vault_lp_ata.reload()?;
    let amount_lp_after = ctx.accounts.vault_lp_ata.amount;
    let amount_to_mint = amount_lp_after
        .checked_sub(amount_lp_before)
        .ok_or(ErrorCode::MathOverflow)?;

    mint_to(
        CpiContext::new_with_signer(
            ctx.accounts.token_program_2022.to_account_info(),
            MintTo {
                mint: ctx.accounts.lp_token.to_account_info(),
                to: ctx.accounts.signer_lp_ata.to_account_info(),
                authority: ctx.accounts.vault.to_account_info(),
            },
            &[vault_seeds],
        ),
        amount_to_mint,
    )?;

    Ok(())
}
