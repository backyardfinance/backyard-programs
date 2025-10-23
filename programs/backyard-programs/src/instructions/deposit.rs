use crate::{errors::ErrorCode, Vault};
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
      associated_token::mint = input_token,
      associated_token::authority = vault,
      associated_token::token_program = token_program,
    )]
    pub vault_input_ata: InterfaceAccount<'info, TokenAccount>,

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
        seeds = [b"vault", protocol_index.to_le_bytes().as_ref(), vault_id.as_ref()],
        bump = vault.bump,
    )]
    pub vault: Account<'info, Vault>,

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
        amount,
    )?;

    Ok(())
}
