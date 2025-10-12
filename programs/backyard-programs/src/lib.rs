pub mod constants;
pub mod errors;
pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;

pub use constants::*;
pub use instructions::*;
pub use state::*;

declare_id!("45No8jKDaf6VUjD42rBYpVkbYGHJHjmLw86kh5tDFRDm");

#[program]
pub mod backyard_programs {
    use super::*;

    pub fn create_lp(ctx: Context<CreateLP>, vault_id: Pubkey, decimals: u8) -> Result<()> {
        create_lp::create_lp(ctx, vault_id, decimals)
    }

    pub fn create_vault(ctx: Context<CreateVault>, vault_id: Pubkey) -> Result<()> {
        create_vault::create_vault(ctx, vault_id)
    }

    pub fn deposit_and_mint_lp(
        ctx: Context<DepositAndMintLP>,
        vault_id: Pubkey,
        amount: u64,
    ) -> Result<()> {
        deposit::deposit_and_mint_lp(ctx, vault_id, amount)
    }

    pub fn burn_lp_and_withdraw(
        ctx: Context<BurnLpAndWithdraw>,
        vault_id: Pubkey,
        amount: u64,
    ) -> Result<()> {
        withdraw::burn_lp_and_withdraw(ctx, vault_id, amount)
    }
}
