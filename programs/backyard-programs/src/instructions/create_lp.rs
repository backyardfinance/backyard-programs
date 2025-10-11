use crate::{errors::ErrorCode, Vault, PROTOCOL_OWNER};
use anchor_lang::prelude::*;
use anchor_lang::system_program::{create_account, transfer, CreateAccount, Transfer};
use anchor_spl::associated_token::spl_associated_token_account::solana_program::rent::{
    DEFAULT_EXEMPTION_THRESHOLD, DEFAULT_LAMPORTS_PER_BYTE_YEAR,
};
use anchor_spl::{
    token_2022::{
        initialize_mint2,
        spl_token_2022::{extension::ExtensionType, pod::PodMint},
        InitializeMint2,
    },
    token_interface::{
        non_transferable_mint_initialize, token_metadata_initialize, NonTransferableMintInitialize,
        TokenInterface, TokenMetadataInitialize,
    },
};
use spl_token_metadata_interface::state::TokenMetadata;
use spl_type_length_value::variable_len_pack::VariableLenPack;

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

pub fn create_lp(
    ctx: Context<CreateLP>,
    vault_id: Pubkey,
    decimals: u8,
    name: String,
    symbol: String,
    uri: String,
) -> Result<()> {
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

    let token_metadata = TokenMetadata {
        name: name.clone(),
        symbol: symbol.clone(),
        uri: uri.clone(),
        ..Default::default()
    };

    let data_len = 4 + token_metadata
        .get_packed_len()
        .map_err(|_| anchor_lang::error::ErrorCode::AccountDidNotDeserialize)?;

    let additional_lamports =
        data_len as u64 * DEFAULT_LAMPORTS_PER_BYTE_YEAR * DEFAULT_EXEMPTION_THRESHOLD as u64;

    transfer(
        CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            Transfer {
                from: ctx.accounts.protocol_owner.to_account_info(),
                to: ctx.accounts.mint_account.to_account_info(),
            },
        ),
        additional_lamports,
    )?;

    token_metadata_initialize(
        CpiContext::new(
            ctx.accounts.token_program_2022.to_account_info(),
            TokenMetadataInitialize {
                program_id: ctx.accounts.token_program_2022.to_account_info(),
                mint: ctx.accounts.mint_account.to_account_info(),
                metadata: ctx.accounts.mint_account.to_account_info(),
                mint_authority: ctx.accounts.protocol_owner.to_account_info(),
                update_authority: ctx.accounts.protocol_owner.to_account_info(),
            },
        ),
        name,
        symbol,
        uri,
    )?;

    Ok(())
}
