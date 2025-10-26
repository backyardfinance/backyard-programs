pub mod constants;
pub mod errors;
pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;

pub use constants::*;
pub use instructions::*;
pub use state::*;

declare_program!(lending);

declare_id!("CUuCLr2DXer9TKTgW6bqJRxQEu4JEvfGV6DcTsoE2E96");

#[program]
pub mod backyard_programs {
    use super::*;

    pub fn create_vault(ctx: Context<CreateVault>, vault_id: Pubkey) -> Result<()> {
        create_vault::create_vault(ctx, vault_id)
    }

    pub fn deposit(ctx: Context<Deposit>, vault_id: Pubkey, amount: u64) -> Result<()> {
        deposit::deposit(ctx, vault_id, amount)
    }

    pub fn withdraw(ctx: Context<Withdraw>, vault_id: Pubkey, amount: u64) -> Result<()> {
        withdraw::withdraw(ctx, vault_id, amount)
    }
}
