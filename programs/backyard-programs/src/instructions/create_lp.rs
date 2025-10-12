use crate::{errors::ErrorCode, Vault, PROTOCOL_OWNER};
use anchor_lang::prelude::*;
use anchor_lang::system_program::{create_account, CreateAccount};
use anchor_spl::{
    token_2022::{
        initialize_mint2,
        spl_token_2022::{extension::ExtensionType, pod::PodMint},
        InitializeMint2,
    },
    token_interface::{
        non_transferable_mint_initialize, NonTransferableMintInitialize, TokenInterface,
    },
};

#[derive(Accounts)]
#[instruction(vault_id: Pubkey)]
pub struct CreateLP<'info> {
    #[account(
        mut,
        address = PROTOCOL_OWNER @ ErrorCode::NotOwner
    )]
    pub protocol_owner: Signer<'info>,

    #[account(
        mut,
        seeds = [b"vault", vault_id.as_ref()],
        bump = vault.bump,
    )]
    pub vault: Account<'info, Vault>,

    #[account(mut)]
    pub mint_account: Signer<'info>,

    pub token_program_2022: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

pub fn create_lp(ctx: Context<CreateLP>, vault_id: Pubkey, decimals: u8) -> Result<()> {
    let vault = ctx.accounts.vault.to_account_info().key();

    let mint_size =
        ExtensionType::try_calculate_account_len::<PodMint>(&[ExtensionType::NonTransferable])?;

    let lamports = (Rent::get()?).minimum_balance(mint_size);

    create_account(
        CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            CreateAccount {
                from: ctx.accounts.protocol_owner.to_account_info(),
                to: ctx.accounts.mint_account.to_account_info(),
            },
        ),
        lamports,
        mint_size as u64,
        &ctx.accounts.token_program_2022.key(),
    )?;

    non_transferable_mint_initialize(CpiContext::new(
        ctx.accounts.token_program_2022.to_account_info(),
        NonTransferableMintInitialize {
            token_program_id: ctx.accounts.token_program_2022.to_account_info(),
            mint: ctx.accounts.mint_account.to_account_info(),
        },
    ))?;

    initialize_mint2(
        CpiContext::new(
            ctx.accounts.token_program_2022.to_account_info(),
            InitializeMint2 {
                mint: ctx.accounts.mint_account.to_account_info(),
            },
        ),
        decimals,
        &vault,
        Some(&vault),
    )?;

    Ok(())
}
