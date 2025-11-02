use crate::{
    errors::ErrorCode,
    kamino_vault_converted::{
        cpi::{
            accounts::{Withdraw, WithdrawFromAvailable, WithdrawFromReserveAccounts},
            withdraw,
        },
        program::KaminoVault,
    },
    Vault,
};
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
pub struct KaminoVaultWithdraw<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,

    #[account(
        mint::token_program = token_program,
        address = vault.token @ ErrorCode::WrongToken
    )]
    pub output_token: Box<InterfaceAccount<'info, Mint>>,

    #[account(
        mut,
        associated_token::mint = output_token,
        associated_token::authority = signer,
        associated_token::token_program = token_program,
    )]
    pub signer_output_ata: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(
      mut,
      associated_token::mint = output_token,
      associated_token::authority = vault,
      associated_token::token_program = token_program,
    )]
    pub vault_output_ata: Box<InterfaceAccount<'info, TokenAccount>>,

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

    /// CHECK: check in logic if there is allocation for this reserve
    #[account(mut)]
    pub reserve: AccountInfo<'info>,

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

    /// CHECK: account constraints checked in account trait
    #[account(address = sysvar::instructions::ID)]
    pub instruction_sysvar_account: AccountInfo<'info>,
    /// CHECK: Kamino lending market
    pub lending_market: AccountInfo<'info>,
    /// CHECK: Kamino lending market authority
    pub lending_market_authority: AccountInfo<'info>,
    /// CHECK: Kamino reserve liquidity supply
    #[account(mut)]
    pub reserve_liquidity_supply: Box<InterfaceAccount<'info, TokenAccount>>,
    /// CHECK: Kamino reserve collateral mint
    #[account(mut)]
    pub reserve_collateral_mint: AccountInfo<'info>,
    /// CHECK: Kamino ctoken vault
    pub ctoken_vault: Box<InterfaceAccount<'info, TokenAccount>>,

    /// CHECK: Kamino lend program
    pub klend_program: AccountInfo<'info>,
    pub kamino_vault: Program<'info, KaminoVault>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub token_program: Interface<'info, TokenInterface>,
    pub token_program_2022: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

pub fn kamino_vault_withdraw<'info>(
    ctx: Context<'_, '_, '_, 'info, KaminoVaultWithdraw<'info>>,
    vault_id: Pubkey,
    lp_amount: u64,
) -> Result<()> {
    let vault_seeds: &[&[u8]] = &[b"vault", vault_id.as_ref(), &[ctx.accounts.vault.bump]];
    let amount_output_before = ctx.accounts.vault_output_ata.amount;
    let remaining_accounts = ctx.remaining_accounts.to_vec();

    require!(lp_amount > 0, ErrorCode::InvalidAmount);

    burn_checked(
        CpiContext::new(
            ctx.accounts.token_program_2022.to_account_info(),
            BurnChecked {
                mint: ctx.accounts.lp_token.to_account_info(),
                from: ctx.accounts.signer_lp_ata.to_account_info(),
                authority: ctx.accounts.signer.to_account_info(),
            },
        ),
        lp_amount,
        ctx.accounts.lp_token.decimals,
    )?;

    withdraw(
        CpiContext::new_with_signer(
            ctx.accounts.kamino_vault.to_account_info(),
            Withdraw {
                withdraw_from_available: WithdrawFromAvailable {
                    user: ctx.accounts.vault.to_account_info(),
                    base_vault_authority: ctx.accounts.base_vault_authority.to_account_info(),
                    event_authority: ctx.accounts.event_authority.to_account_info(),
                    klend_program: ctx.accounts.klend_program.to_account_info(),
                    program: ctx.accounts.kamino_vault.to_account_info(),
                    shares_mint: ctx.accounts.shares_mint.to_account_info(),
                    shares_token_program: ctx.accounts.token_program.to_account_info(),
                    token_mint: ctx.accounts.output_token.to_account_info(),
                    token_program: ctx.accounts.token_program.to_account_info(),
                    token_vault: ctx.accounts.token_vault.to_account_info(),
                    user_shares_ata: ctx.accounts.vault_lp_ata.to_account_info(),
                    user_token_ata: ctx.accounts.vault_output_ata.to_account_info(),
                    vault_state: ctx.accounts.vault_state.to_account_info(),
                },
                withdraw_from_reserve_accounts: WithdrawFromReserveAccounts {
                    ctoken_vault: ctx.accounts.ctoken_vault.to_account_info(),
                    instruction_sysvar_account: ctx
                        .accounts
                        .instruction_sysvar_account
                        .to_account_info(),
                    lending_market: ctx.accounts.lending_market.to_account_info(),
                    lending_market_authority: ctx
                        .accounts
                        .lending_market_authority
                        .to_account_info(),
                    reserve: ctx.accounts.reserve.to_account_info(),
                    reserve_collateral_mint: ctx.accounts.reserve_collateral_mint.to_account_info(),
                    reserve_collateral_token_program: ctx.accounts.token_program.to_account_info(),
                    reserve_liquidity_supply: ctx
                        .accounts
                        .reserve_liquidity_supply
                        .to_account_info(),
                    vault_state: ctx.accounts.vault_state.to_account_info(),
                },
                event_authority: ctx.accounts.event_authority.to_account_info(),
                program: ctx.accounts.kamino_vault.to_account_info(),
            },
            &[vault_seeds],
        )
        .with_remaining_accounts(remaining_accounts),
        lp_amount,
    )?;

    ctx.accounts.vault_output_ata.reload()?;
    let amount_output_after = ctx.accounts.vault_output_ata.amount;
    let amount_to_transfer = amount_output_after
        .checked_sub(amount_output_before)
        .ok_or(ErrorCode::MathOverflow)?;

    transfer_checked(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            TransferChecked {
                from: ctx.accounts.vault_output_ata.to_account_info(),
                mint: ctx.accounts.output_token.to_account_info(),
                to: ctx.accounts.signer_output_ata.to_account_info(),
                authority: ctx.accounts.signer.to_account_info(),
            },
            &[vault_seeds],
        ),
        amount_to_transfer,
        ctx.accounts.output_token.decimals,
    )?;

    Ok(())
}
