use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
    #[msg("Custom error message")]
    CustomError,
    #[msg("You are not the owner")]
    NotOwner,
    #[msg("Invalid LP mint authority")]
    InvalidLpMintAuthority,
    #[msg("Invalid amount")]
    InvalidAmount,
    #[msg("Wrong token")]
    WrongToken,
}
