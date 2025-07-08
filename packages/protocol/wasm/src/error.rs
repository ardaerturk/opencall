use thiserror::Error;
use wasm_bindgen::JsValue;

#[derive(Error, Debug)]
pub enum Error {
    #[error("OpenMLS error: {0}")]
    OpenMlsError(String),
    
    #[error("Invalid state: {0}")]
    InvalidState(String),
    
    #[error("Member not found: {0}")]
    MemberNotFound(String),
    
    #[error("Invalid message type: {0}")]
    InvalidMessageType(String),
    
    #[error("Serialization error: {0}")]
    SerializationError(String),
    
    #[error("Codec error: {0}")]
    CodecError(String),
    
    #[error("Storage error: {0}")]
    StorageError(String),
    
    #[error("Crypto error: {0}")]
    CryptoError(String),
}

impl From<Error> for JsValue {
    fn from(error: Error) -> Self {
        JsValue::from_str(&error.to_string())
    }
}

impl<T> From<openmls::prelude::LibraryError<T>> for Error {
    fn from(error: openmls::prelude::LibraryError<T>) -> Self {
        Error::OpenMlsError(error.to_string())
    }
}

impl From<openmls::prelude::AddMembersError<()>> for Error {
    fn from(error: openmls::prelude::AddMembersError<()>) -> Self {
        Error::OpenMlsError(format!("Add members error: {:?}", error))
    }
}

impl From<openmls::prelude::RemoveMembersError<()>> for Error {
    fn from(error: openmls::prelude::RemoveMembersError<()>) -> Self {
        Error::OpenMlsError(format!("Remove members error: {:?}", error))
    }
}

impl From<openmls::prelude::ProcessMessageError> for Error {
    fn from(error: openmls::prelude::ProcessMessageError) -> Self {
        Error::OpenMlsError(format!("Process message error: {:?}", error))
    }
}

impl From<openmls::prelude::TlsCodecError> for Error {
    fn from(error: openmls::prelude::TlsCodecError) -> Self {
        Error::CodecError(error.to_string())
    }
}

pub type Result<T> = std::result::Result<T, Error>;