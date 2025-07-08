use crate::error::{Error, Result};
use crate::storage::MLSStorage;
use crate::types::*;
use openmls::prelude::*;
use openmls_basic_credential::SignatureKeyPair;
use openmls_rust_crypto::OpenMlsRustCrypto;
use serde_wasm_bindgen::to_value;
use wasm_bindgen::prelude::*;

/// The main MLS client that manages groups and cryptographic operations
#[wasm_bindgen]
pub struct MLSClient {
    identity: Vec<u8>,
    crypto_provider: OpenMlsRustCrypto,
    storage: MLSStorage,
    credential: Credential,
    signature_keys: SignatureKeyPair,
}

#[wasm_bindgen]
impl MLSClient {
    /// Initialize a new MLS client with the given identity
    #[wasm_bindgen(js_name = initialize)]
    pub fn new(identity: String) -> Result<MLSClient> {
        let crypto_provider = OpenMlsRustCrypto::default();
        let storage = MLSStorage::new();
        
        // Create credential from identity
        let identity_bytes = identity.as_bytes().to_vec();
        let credential = Credential::new_basic(identity_bytes.clone());
        
        // Generate signature key pair
        let signature_keys = SignatureKeyPair::new(SignatureScheme::ED25519)
            .map_err(|e| Error::CryptoError(e.to_string()))?;
        
        // Store the signature key pair
        signature_keys
            .store(&storage)
            .map_err(|e| Error::StorageError(e.to_string()))?;
        
        Ok(MLSClient {
            identity: identity_bytes,
            crypto_provider,
            storage,
            credential,
            signature_keys,
        })
    }
    
    /// Create a new MLS group
    #[wasm_bindgen(js_name = createGroup)]
    pub fn create_group(&self, group_id: Vec<u8>) -> Result<MLSGroup> {
        let mls_group_config = MlsGroupCreateConfig::builder()
            .crypto_config(CryptoConfig::default())
            .build();
        
        let mut group = MlsGroup::new_with_group_id(
            &self.crypto_provider,
            &self.signature_keys,
            &mls_group_config,
            group_id.clone().into(),
            CredentialWithKey {
                credential: self.credential.clone(),
                signature_key: self.signature_keys.public().into(),
            },
        )
        .map_err(|e| Error::OpenMlsError(e.to_string()))?;
        
        // Store the group
        group
            .save(&self.storage)
            .map_err(|e| Error::StorageError(e.to_string()))?;
        
        Ok(MLSGroup {
            group_id,
            crypto_provider: self.crypto_provider.clone(),
            storage: self.storage.clone(),
        })
    }
    
    /// Join an existing group using a welcome message
    #[wasm_bindgen(js_name = joinGroup)]
    pub fn join_group(&self, welcome_bytes: &[u8]) -> Result<MLSGroup> {
        let welcome = MlsMessageIn::tls_deserialize_exact(welcome_bytes)
            .map_err(|e| Error::CodecError(e.to_string()))?;
        
        let welcome = match welcome.extract() {
            MlsMessageBodyIn::Welcome(w) => w,
            _ => return Err(Error::InvalidMessageType("Expected welcome message".to_string())),
        };
        
        let mls_group_config = MlsGroupJoinConfig::builder()
            .crypto_config(CryptoConfig::default())
            .build();
        
        let mut group = MlsGroup::new_from_welcome(
            &self.crypto_provider,
            &mls_group_config,
            welcome,
            Some(&self.storage),
        )?;
        
        // Get the group ID
        let group_id = group.group_id().as_slice().to_vec();
        
        // Store the group
        group
            .save(&self.storage)
            .map_err(|e| Error::StorageError(e.to_string()))?;
        
        Ok(MLSGroup {
            group_id,
            crypto_provider: self.crypto_provider.clone(),
            storage: self.storage.clone(),
        })
    }
    
    /// Export a key package for this client
    #[wasm_bindgen(js_name = exportKeyPackage)]
    pub fn export_key_package(&self) -> Result<Vec<u8>> {
        let key_package = KeyPackage::builder()
            .build(
                CryptoConfig::default(),
                &self.crypto_provider,
                &self.signature_keys,
                CredentialWithKey {
                    credential: self.credential.clone(),
                    signature_key: self.signature_keys.public().into(),
                },
            )
            .map_err(|e| Error::OpenMlsError(e.to_string()))?;
        
        // Store the key package
        key_package
            .hash_ref(&self.crypto_provider)
            .map_err(|e| Error::CryptoError(e.to_string()))
            .and_then(|hash_ref| {
                self.storage
                    .write_key_package(&hash_ref, &key_package)
                    .map_err(|e| Error::StorageError(e.to_string()))
            })?;
        
        key_package
            .tls_serialize_detached()
            .map_err(|e| Error::CodecError(e.to_string()))
    }
}

/// Represents an MLS group
#[wasm_bindgen]
pub struct MLSGroup {
    group_id: Vec<u8>,
    crypto_provider: OpenMlsRustCrypto,
    storage: MLSStorage,
}

#[wasm_bindgen]
impl MLSGroup {
    /// Add a member to the group using their key package
    #[wasm_bindgen(js_name = addMember)]
    pub fn add_member(&self, key_package_bytes: &[u8]) -> Result<JsValue> {
        let mut group = self.load_group()?;
        
        let key_package = KeyPackageIn::tls_deserialize_exact(key_package_bytes)
            .map_err(|e| Error::CodecError(e.to_string()))?;
        
        let (mls_message_out, welcome_out, _group_info) = group
            .add_members(&self.crypto_provider, &self.storage, &[key_package])?;
        
        // Save the updated group state
        group
            .save(&self.storage)
            .map_err(|e| Error::StorageError(e.to_string()))?;
        
        let commit_bytes = mls_message_out
            .tls_serialize_detached()
            .map_err(|e| Error::CodecError(e.to_string()))?;
        
        let welcome_bytes = if let Some(welcome) = welcome_out {
            vec![welcome
                .tls_serialize_detached()
                .map_err(|e| Error::CodecError(e.to_string()))?]
        } else {
            vec![]
        };
        
        let commit = MLSCommit {
            commit: commit_bytes,
            welcome: welcome_bytes,
        };
        
        to_value(&commit).map_err(|e| Error::SerializationError(e.to_string()))
    }
    
    /// Remove a member from the group
    #[wasm_bindgen(js_name = removeMember)]
    pub fn remove_member(&self, member_id: &str) -> Result<JsValue> {
        let mut group = self.load_group()?;
        
        // Find the member by credential
        let member_to_remove = group
            .members()
            .find(|member| {
                if let Credential::Basic(data) = &member.credential {
                    String::from_utf8_lossy(data) == member_id
                } else {
                    false
                }
            })
            .ok_or_else(|| Error::MemberNotFound(member_id.to_string()))?;
        
        let leaf_index = member_to_remove.index;
        
        let (mls_message_out, welcome_out, _group_info) = group
            .remove_members(&self.crypto_provider, &self.storage, &[leaf_index])?;
        
        // Save the updated group state
        group
            .save(&self.storage)
            .map_err(|e| Error::StorageError(e.to_string()))?;
        
        let commit_bytes = mls_message_out
            .tls_serialize_detached()
            .map_err(|e| Error::CodecError(e.to_string()))?;
        
        let welcome_bytes = if let Some(welcome) = welcome_out {
            vec![welcome
                .tls_serialize_detached()
                .map_err(|e| Error::CodecError(e.to_string()))?]
        } else {
            vec![]
        };
        
        let commit = MLSCommit {
            commit: commit_bytes,
            welcome: welcome_bytes,
        };
        
        to_value(&commit).map_err(|e| Error::SerializationError(e.to_string()))
    }
    
    /// Encrypt a message for the group
    #[wasm_bindgen(js_name = encryptMessage)]
    pub fn encrypt_message(&self, plaintext: &[u8]) -> Result<JsValue> {
        let mut group = self.load_group()?;
        
        let mls_message_out = group
            .create_message(&self.crypto_provider, &self.storage, plaintext)
            .map_err(|e| Error::OpenMlsError(e.to_string()))?;
        
        let ciphertext_bytes = mls_message_out
            .tls_serialize_detached()
            .map_err(|e| Error::CodecError(e.to_string()))?;
        
        let ciphertext = MLSCiphertext {
            data: ciphertext_bytes,
            epoch: group.epoch().as_u64(),
        };
        
        to_value(&ciphertext).map_err(|e| Error::SerializationError(e.to_string()))
    }
    
    /// Decrypt a message from the group
    #[wasm_bindgen(js_name = decryptMessage)]
    pub fn decrypt_message(&self, ciphertext_bytes: &[u8]) -> Result<Vec<u8>> {
        let mut group = self.load_group()?;
        
        let mls_message = MlsMessageIn::tls_deserialize_exact(ciphertext_bytes)
            .map_err(|e| Error::CodecError(e.to_string()))?;
        
        let unverified_message = group
            .parse_message(mls_message, &self.crypto_provider, &self.storage)
            .map_err(|e| Error::OpenMlsError(e.to_string()))?;
        
        let processed_message = group
            .process_unverified_message(unverified_message, None, &self.crypto_provider, &self.storage)?;
        
        // Save the updated group state if needed
        group
            .save(&self.storage)
            .map_err(|e| Error::StorageError(e.to_string()))?;
        
        match processed_message.into_content() {
            ProcessedMessageContent::ApplicationMessage(app_msg) => {
                Ok(app_msg.into_bytes())
            }
            ProcessedMessageContent::ProposalMessage(_) => {
                Err(Error::InvalidMessageType("Received proposal, expected application message".to_string()))
            }
            ProcessedMessageContent::ExhumerMessage(_) => {
                Err(Error::InvalidMessageType("Received exhumer message".to_string()))
            }
            ProcessedMessageContent::StagedCommitMessage(_) => {
                Err(Error::InvalidMessageType("Received commit, expected application message".to_string()))
            }
        }
    }
    
    /// Process a pending commit
    #[wasm_bindgen(js_name = processCommit)]
    pub fn process_commit(&self, commit_bytes: &[u8]) -> Result<()> {
        let mut group = self.load_group()?;
        
        let mls_message = MlsMessageIn::tls_deserialize_exact(commit_bytes)
            .map_err(|e| Error::CodecError(e.to_string()))?;
        
        let unverified_message = group
            .parse_message(mls_message, &self.crypto_provider, &self.storage)
            .map_err(|e| Error::OpenMlsError(e.to_string()))?;
        
        group.process_unverified_message(unverified_message, None, &self.crypto_provider, &self.storage)?;
        
        // Save the updated group state
        group
            .save(&self.storage)
            .map_err(|e| Error::StorageError(e.to_string()))?;
        
        Ok(())
    }
    
    /// Get the current epoch of the group
    #[wasm_bindgen(js_name = getCurrentEpoch)]
    pub fn get_current_epoch(&self) -> Result<u64> {
        let group = self.load_group()?;
        Ok(group.epoch().as_u64())
    }
    
    /// Helper method to load the group from storage
    fn load_group(&self) -> Result<MlsGroup> {
        let group_id: GroupId = self.group_id.clone().into();
        MlsGroup::load(&self.storage, &group_id)
            .map_err(|e| Error::StorageError(e.to_string()))?
            .ok_or_else(|| Error::InvalidState("Group not found in storage".to_string()))
    }
}