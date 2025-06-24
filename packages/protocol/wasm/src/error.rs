use mls_rs::MlsError;
use thiserror::Error;
use wasm_bindgen::JsValue;

#[derive(Error, Debug)]
pub enum Error {
    #[error("MLS error: {0}")]
    MlsError(#[from] MlsError),
    
    #[error("Invalid state: {0}")]
    InvalidState(String),
    
    #[error("Member not found: {0}")]
    MemberNotFound(String),
    
    #[error("Invalid message type: {0}")]
    InvalidMessageType(String),
    
    #[error("Serialization error: {0}")]
    SerializationError(String),
    
    #[error("Codec error: {0}")]
    CodecError(#[from] mls_rs::mls_rs_codec::Error),
}

impl From<Error> for JsValue {
    fn from(error: Error) -> Self {
        JsValue::from_str(&error.to_string())
    }
}

pub type Result<T> = std::result::Result<T, Error>;