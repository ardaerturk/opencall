use crate::error::{Error, Result};
use crate::types::*;
use mls_rs::client_builder::ClientBuilder;
use mls_rs::identity::{Credential, SigningIdentity};
use mls_rs::mls_rs_codec::{MlsDecode, MlsEncode};
use mls_rs::{Client, Group, MlsMessage};
use mls_rs_provider_rustcrypto::RustCryptoProvider;
use serde_wasm_bindgen::{from_value, to_value};
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub struct MLSClient {
    client: Client<RustCryptoProvider>,
}

#[wasm_bindgen]
impl MLSClient {
    #[wasm_bindgen(constructor)]
    pub fn new(identity_bytes: &[u8]) -> Result<MLSClient> {
        let crypto_provider = RustCryptoProvider::default();
        
        let signing_identity = SigningIdentity::new(
            Credential::Basic(identity_bytes.to_vec()),
            crypto_provider.signature_key_from_random()?
        );
        
        let client = ClientBuilder::new()
            .crypto_provider(crypto_provider)
            .identity_provider(signing_identity)
            .build();
        
        Ok(MLSClient { client })
    }
    
    #[wasm_bindgen(js_name = createGroup)]
    pub fn create_group(&mut self, group_id: &[u8]) -> Result<MLSGroup> {
        let group = self.client.create_group(Default::default())?;
        
        Ok(MLSGroup {
            group: Some(group),
            pending_commit: None,
        })
    }
    
    #[wasm_bindgen(js_name = joinGroup)]
    pub fn join_group(&mut self, welcome_bytes: &[u8]) -> Result<MLSGroup> {
        let welcome = MlsMessage::decode(welcome_bytes)?;
        
        let group = self.client.join_group(None, &welcome)?;
        group.commit_pending_proposals()?;
        
        Ok(MLSGroup {
            group: Some(group),
            pending_commit: None,
        })
    }
    
    #[wasm_bindgen(js_name = createKeyPackage)]
    pub fn create_key_package(&self) -> Result<Vec<u8>> {
        let key_package = self.client.generate_key_package_message()?;
        Ok(key_package.encode_to_vec()?)
    }
}

#[wasm_bindgen]
pub struct MLSGroup {
    group: Option<Group<RustCryptoProvider>>,
    pending_commit: Option<MlsMessage>,
}

#[wasm_bindgen]
impl MLSGroup {
    #[wasm_bindgen(js_name = addMember)]
    pub fn add_member(&mut self, key_package_bytes: &[u8]) -> Result<JsValue> {
        let group = self.group.as_mut()
            .ok_or_else(|| Error::InvalidState("Group not initialized".to_string()))?;
            
        let key_package = MlsMessage::decode(key_package_bytes)?;
        let commit = group.commit_external([key_package], &[])?;
        
        self.pending_commit = Some(commit.commit_message.clone());
        
        to_value(&MLSCommit {
            commit: commit.commit_message.encode_to_vec()?,
            welcome: commit.welcome_messages
                .into_iter()
                .map(|w| w.encode_to_vec())
                .collect::<Result<Vec<_>>>()?,
        }).map_err(|e| Error::SerializationError(e.to_string()))
    }
    
    #[wasm_bindgen(js_name = removeMember)]  
    pub fn remove_member(&mut self, member_id: &str) -> Result<JsValue> {
        let group = self.group.as_mut()
            .ok_or_else(|| Error::InvalidState("Group not initialized".to_string()))?;
            
        // Find member by credential
        let members = group.members()?;
        let member_to_remove = members.iter()
            .find(|m| {
                if let Credential::Basic(data) = &m.credential {
                    String::from_utf8_lossy(data) == member_id
                } else {
                    false
                }
            })
            .ok_or_else(|| Error::MemberNotFound(member_id.to_string()))?;
            
        let commit = group.commit_external([], &[member_to_remove.index])?;
        self.pending_commit = Some(commit.commit_message.clone());
        
        to_value(&MLSCommit {
            commit: commit.commit_message.encode_to_vec()?,
            welcome: vec![],
        }).map_err(|e| Error::SerializationError(e.to_string()))
    }
    
    #[wasm_bindgen(js_name = encrypt)]
    pub fn encrypt(&mut self, plaintext: &[u8]) -> Result<JsValue> {
        let group = self.group.as_mut()
            .ok_or_else(|| Error::InvalidState("Group not initialized".to_string()))?;
            
        let ciphertext = group.encrypt_application_message(plaintext, vec![])?;
        
        to_value(&MLSCiphertext {
            data: ciphertext.encode_to_vec()?,
            epoch: group.current_epoch(),
        }).map_err(|e| Error::SerializationError(e.to_string()))
    }
    
    #[wasm_bindgen(js_name = decrypt)]
    pub fn decrypt(&mut self, ciphertext_js: JsValue) -> Result<Vec<u8>> {
        let group = self.group.as_mut()
            .ok_or_else(|| Error::InvalidState("Group not initialized".to_string()))?;
            
        let ciphertext: MLSCiphertext = from_value(ciphertext_js)
            .map_err(|e| Error::SerializationError(e.to_string()))?;
            
        let mls_message = MlsMessage::decode(&ciphertext.data)?;
        let (plaintext, _) = group.process_incoming_message(mls_message)?;
        
        match plaintext {
            mls_rs::ReceivedMessage::ApplicationMessage(data) => Ok(data.data().to_vec()),
            _ => Err(Error::InvalidMessageType("Expected application message".to_string())),
        }
    }
    
    #[wasm_bindgen(js_name = getCurrentEpoch)]
    pub fn get_current_epoch(&self) -> Result<u64> {
        let group = self.group.as_ref()
            .ok_or_else(|| Error::InvalidState("Group not initialized".to_string()))?;
            
        Ok(group.current_epoch())
    }
    
    #[wasm_bindgen(js_name = processPendingCommit)]
    pub fn process_pending_commit(&mut self) -> Result<()> {
        let group = self.group.as_mut()
            .ok_or_else(|| Error::InvalidState("Group not initialized".to_string()))?;
            
        if let Some(commit) = self.pending_commit.take() {
            group.process_incoming_message(commit)?;
        }
        
        Ok(())
    }
}