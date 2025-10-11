pub mod constants;
pub mod errors;
pub mod instructions;
pub mod state;
pub mod types;

use anchor_lang::prelude::*;

pub use constants::*;
pub use instructions::*;
pub use state::*;
pub use types::*;

declare_id!("45No8jKDaf6VUjD42rBYpVkbYGHJHjmLw86kh5tDFRDm");

#[program]
pub mod backyard_programs {
    use super::*;

    pub fn create_lp(
        ctx: Context<CreateLP>,
        token_id: Pubkey,
        decimals: u8,
        name: String,
        symbol: String,
        uri: String,
    ) -> Result<()> {
        create_lp::create_lp(ctx, token_id, decimals, name, symbol, uri)
    }

    pub fn create_vault(ctx: Context<CreateVault>, vault_id: Pubkey) -> Result<()> {
        create_vault::create_vault(ctx, vault_id)
    }
}
