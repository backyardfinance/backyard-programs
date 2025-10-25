use crate::{
    errors::ErrorCode,
    lending::{
        accounts::{Lending, LendingAdmin},
        cpi::{accounts::Deposit as JupiterDeposit, deposit as jupiter_deposit},
        program::Lending as LendingProgram,
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
#[instruction(protocol_index: u8, vault_id: Pubkey)]
pub struct Deposit<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,

    #[account(mint::token_program = token_program)]
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
      associated_token::mint = f_token_mint,
      associated_token::authority = vault,
      associated_token::token_program = token_program,
    )]
    pub vault_lp_ata: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(
      mut,
      mint::token_program = token_program_2022,
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
        seeds = [b"vault", protocol_index.to_le_bytes().as_ref(), vault_id.as_ref()],
        bump = vault.bump,
    )]
    pub vault: Box<Account<'info, Vault>>,

    pub lending_admin: Box<Account<'info, LendingAdmin>>,
    #[account(mut)]
    pub lending: Box<Account<'info, Lending>>,
    #[account(mut)]
    pub f_token_mint: Box<InterfaceAccount<'info, Mint>>,

    /// CHECK: verify by jupiter
    #[account(mut)]
    pub supply_token_reserves_liquidity: AccountInfo<'info>,
    /// CHECK: verify by jupiter
    #[account(mut)]
    pub lending_supply_position_on_liquidity: AccountInfo<'info>,
    /// CHECK: verify by jupiter
    pub rate_model: AccountInfo<'info>,
    /// CHECK: verify by jupiter
    #[account(mut)]
    pub jupiter_vault: AccountInfo<'info>,
    /// CHECK: verify by jupiter
    #[account(mut)]
    pub liquidity: AccountInfo<'info>,
    /// CHECK: verify by jupiter
    #[account(mut)]
    pub liquidity_program: AccountInfo<'info>,
    /// CHECK: belongs to Jupiter Lend Rewards program (jup7TthsMgcR9Y3L277b8Eo9uboVSmu1utkuXHNUKar)
    pub rewards_rate_model: AccountInfo<'info>,
    pub lending_program: Program<'info, LendingProgram>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub token_program: Interface<'info, TokenInterface>,
    pub token_program_2022: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

pub fn deposit(
    ctx: Context<Deposit>,
    protocol_index: u8,
    vault_id: Pubkey,
    amount: u64,
) -> Result<()> {
    let vault_seeds: &[&[u8]] = &[
        b"vault",
        &protocol_index.to_le_bytes(),
        vault_id.as_ref(),
        &[ctx.accounts.vault.bump],
    ];

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

    let lp_amount = jupiter_deposit(
        CpiContext::new_with_signer(
            ctx.accounts.lending_program.to_account_info(),
            JupiterDeposit {
                signer: ctx.accounts.vault.to_account_info(),
                depositor_token_account: ctx.accounts.vault_input_ata.to_account_info(),
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
            &[vault_seeds],
        ),
        amount,
    )?;

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
        lp_amount.get(),
    )?;

    Ok(())
}
