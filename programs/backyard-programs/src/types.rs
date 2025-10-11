use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct MintArgs {
    pub token_id: Pubkey,
    pub decimals: u8,
    pub name: String,
    pub symbol: String,
    pub uri: String,
}
