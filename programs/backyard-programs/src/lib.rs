pub mod constants;
pub mod errors;
pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;

pub use constants::*;
pub use instructions::*;
pub use state::*;

declare_program!(lending);
declare_program!(kamino_vault_converted);

declare_id!("CUuCLr2DXer9TKTgW6bqJRxQEu4JEvfGV6DcTsoE2E96");

#[program]
pub mod backyard_programs {
    use super::*;

    pub fn create_vault(ctx: Context<CreateVault>, vault_id: Pubkey) -> Result<()> {
        create_vault::create_vault(ctx, vault_id)
    }

    pub fn jupiter_deposit(
        ctx: Context<JupiterDeposit>,
        vault_id: Pubkey,
        input_amount: u64,
    ) -> Result<()> {
        jupiter_deposit::jupiter_deposit(ctx, vault_id, input_amount)
    }

    pub fn jupiter_withdraw(
        ctx: Context<JupiterWithdraw>,
        vault_id: Pubkey,
        output_amount: u64,
    ) -> Result<()> {
        jupiter_withdraw::jupiter_withdraw(ctx, vault_id, output_amount)
    }

    pub fn kamino_vault_deposit<'info>(
        ctx: Context<'_, '_, '_, 'info, KaminoVaultDeposit<'info>>,
        vault_id: Pubkey,
        input_amount: u64,
    ) -> Result<()> {
        kamino_deposit::kamino_vault_deposit(ctx, vault_id, input_amount)
    }

    pub fn kamino_vault_withdraw<'info>(
        ctx: Context<'_, '_, '_, 'info, KaminoVaultWithdraw<'info>>,
        vault_id: Pubkey,
        lp_amount: u64,
    ) -> Result<()> {
        kamino_withdraw::kamino_vault_withdraw(ctx, vault_id, lp_amount)
    }
}
