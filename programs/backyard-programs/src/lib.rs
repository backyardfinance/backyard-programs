pub mod constants;
pub mod errors;
pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;

pub use constants::*;
pub use instructions::*;
pub use state::*;

declare_program!(lending_dev);

declare_id!("CUuCLr2DXer9TKTgW6bqJRxQEu4JEvfGV6DcTsoE2E96");

#[program]
pub mod backyard_programs {
    use super::*;

    pub fn create_vault(
        ctx: Context<CreateVault>,
        protocol_index: u8,
        vault_id: Pubkey,
    ) -> Result<()> {
        create_vault::create_vault(ctx, protocol_index, vault_id)
    }

    pub fn deposit(
        ctx: Context<Deposit>,
        protocol_index: u8,
        vault_id: Pubkey,
        amount: u64,
    ) -> Result<()> {
        deposit::deposit(ctx, protocol_index, vault_id, amount)
    }

    pub fn withdraw(
        ctx: Context<Withdraw>,
        protocol_index: u8,
        vault_id: Pubkey,
        amount: u64,
    ) -> Result<()> {
        withdraw::withdraw(ctx, protocol_index, vault_id, amount)
    }
}
