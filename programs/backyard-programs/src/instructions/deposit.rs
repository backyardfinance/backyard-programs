use crate::{
    errors::ErrorCode,
    lending_dev::{
        accounts::{Lending, LendingAdmin, LendingRewardsRateModel},
        cpi::{accounts::Deposit as JupiterDeposit, deposit as jupiter_deposit},
        program::Lending as LendingProgram,
    },
    Vault,
};
use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{mint_to, Mint, MintTo, TokenAccount, TokenInterface},
};

#[derive(Accounts)]
#[instruction(vault_id: Pubkey)]
pub struct Deposit<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,

    #[account(mint::token_program = token_program)]
    pub input_token: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        associated_token::mint = input_token,
        associated_token::authority = signer,
        associated_token::token_program = token_program,
    )]
    pub signer_input_ata: InterfaceAccount<'info, TokenAccount>,

    #[account(
      mut,
      associated_token::mint = f_token_mint,
      associated_token::authority = vault,
      associated_token::token_program = token_program_2022,
    )]
    pub vault_lp_ata: InterfaceAccount<'info, TokenAccount>,

    #[account(
      mut,
      mint::authority = vault,
      mint::freeze_authority = vault,
      mint::token_program = token_program_2022,
    )]
    pub lp_token: InterfaceAccount<'info, Mint>,

    #[account(
      init_if_needed,
      payer = signer,
      associated_token::mint = lp_token,
      associated_token::authority = signer,
      associated_token::token_program = token_program_2022,
    )]
    pub signer_lp_ata: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [b"vault", vault_id.as_ref()],
        bump = vault.bump,
    )]
    pub vault: Account<'info, Vault>,

    pub lending_admin: Account<'info, LendingAdmin>,
    pub lending: Account<'info, Lending>,
    pub f_token_mint: InterfaceAccount<'info, Mint>,

    /// CHECK: verify by jupiter
    pub supply_token_reserves_liquidity: AccountInfo<'info>,
    /// CHECK: verify by jupiter
    pub lending_supply_position_on_liquidity: AccountInfo<'info>,
    /// CHECK: verify by jupiter
    pub rate_model: AccountInfo<'info>,
    /// CHECK: verify by jupiter
    pub jupiter_vault: AccountInfo<'info>,
    /// CHECK: verify by jupiter
    pub liquidity: AccountInfo<'info>,
    /// CHECK: verify by jupiter
    pub liquidity_program: AccountInfo<'info>,

    pub rewards_rate_model: Account<'info, LendingRewardsRateModel>,
    pub lending_program: Program<'info, LendingProgram>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub token_program: Interface<'info, TokenInterface>,
    pub token_program_2022: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

pub fn deposit(ctx: Context<Deposit>, vault_id: Pubkey, amount: u64) -> Result<()> {
    let vault_seeds: &[&[u8]] = &[b"vault", vault_id.as_ref(), &[ctx.accounts.vault.bump]];

    let lp_balance_before = ctx.accounts.vault_lp_ata.amount;

    require!(amount > 0, ErrorCode::InvalidAmount);

    jupiter_deposit(
        CpiContext::new(
            ctx.accounts.lending_program.to_account_info(),
            JupiterDeposit {
                signer: ctx.accounts.signer.to_account_info(),
                depositor_token_account: ctx.accounts.signer_input_ata.to_account_info(),
                recipient_token_account: ctx.accounts.vault_lp_ata.to_account_info(),
                mint: ctx.accounts.input_token.to_account_info(),
                lending_admin: ctx.accounts.lending_admin.to_account_info(),
                lending: ctx.accounts.lending.to_account_info(),
                f_token_mint: ctx.accounts.f_token_mint.to_account_info(),
                supply_token_reserves_liquidity: ctx
                    .accounts
                    .supply_token_reserves_liquidity
                    .to_account_info(),
                lending_supply_position_on_liquidity: ctx
                    .accounts
                    .lending_supply_position_on_liquidity
                    .to_account_info(),
                rate_model: ctx.accounts.rate_model.to_account_info(),
                vault: ctx.accounts.jupiter_vault.to_account_info(),
                liquidity: ctx.accounts.liquidity.to_account_info(),
                liquidity_program: ctx.accounts.liquidity_program.to_account_info(),
                rewards_rate_model: ctx.accounts.rewards_rate_model.to_account_info(),
                token_program: ctx.accounts.token_program.to_account_info(),
                associated_token_program: ctx.accounts.associated_token_program.to_account_info(),
                system_program: ctx.accounts.system_program.to_account_info(),
            },
        ),
        amount,
    )?;

    ctx.accounts.vault_lp_ata.reload()?;
    let lp_balance_after = ctx.accounts.vault_lp_ata.amount;

    let lp_amount = lp_balance_after.checked_sub(lp_balance_before).unwrap();

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
        lp_amount,
    )?;

    Ok(())
}
