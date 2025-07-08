use openmls_rust_crypto::MemoryStorage;
use openmls_traits::storage::{StorageProvider, CURRENT_VERSION};

/// A wrapper around the OpenMLS memory storage implementation.
/// This provides in-memory storage for MLS groups and key material.
/// In a production environment, this could be replaced with persistent storage.
#[derive(Default, Clone)]
pub struct MLSStorage {
    storage: MemoryStorage,
}

impl MLSStorage {
    pub fn new() -> Self {
        Self {
            storage: MemoryStorage::default(),
        }
    }
}

impl StorageProvider<CURRENT_VERSION> for MLSStorage {
    type Error = <MemoryStorage as StorageProvider<CURRENT_VERSION>>::Error;

    fn write_mls_group_state<
        GroupId: openmls_traits::types::GroupId<CURRENT_VERSION>,
        MlsGroupState: openmls_traits::types::MlsGroupState<CURRENT_VERSION>,
    >(
        &self,
        group_id: &GroupId,
        group_state: &MlsGroupState,
    ) -> Result<(), Self::Error> {
        self.storage.write_mls_group_state(group_id, group_state)
    }

    fn read_mls_group_state<
        GroupId: openmls_traits::types::GroupId<CURRENT_VERSION>,
        MlsGroupState: openmls_traits::types::MlsGroupState<CURRENT_VERSION>,
    >(
        &self,
        group_id: &GroupId,
    ) -> Result<Option<MlsGroupState>, Self::Error> {
        self.storage.read_mls_group_state(group_id)
    }

    fn delete_mls_group_state<GroupId: openmls_traits::types::GroupId<CURRENT_VERSION>>(
        &self,
        group_id: &GroupId,
    ) -> Result<(), Self::Error> {
        self.storage.delete_mls_group_state(group_id)
    }

    fn write_key_package<
        HashReference: openmls_traits::types::HashReference<CURRENT_VERSION>,
        KeyPackage: openmls_traits::types::KeyPackage<CURRENT_VERSION>,
    >(
        &self,
        hash_ref: &HashReference,
        key_package: &KeyPackage,
    ) -> Result<(), Self::Error> {
        self.storage.write_key_package(hash_ref, key_package)
    }

    fn read_key_package<
        HashReference: openmls_traits::types::HashReference<CURRENT_VERSION>,
        KeyPackage: openmls_traits::types::KeyPackage<CURRENT_VERSION>,
    >(
        &self,
        hash_ref: &HashReference,
    ) -> Result<Option<KeyPackage>, Self::Error> {
        self.storage.read_key_package(hash_ref)
    }

    fn delete_key_package<HashReference: openmls_traits::types::HashReference<CURRENT_VERSION>>(
        &self,
        hash_ref: &HashReference,
    ) -> Result<(), Self::Error> {
        self.storage.delete_key_package(hash_ref)
    }

    fn write_signature_key_pair<
        SignaturePublicKey: openmls_traits::types::SignaturePublicKey<CURRENT_VERSION>,
        SignatureKeyPair: openmls_traits::types::SignatureKeyPair<CURRENT_VERSION>,
    >(
        &self,
        public_key: &SignaturePublicKey,
        signature_key_pair: &SignatureKeyPair,
    ) -> Result<(), Self::Error> {
        self.storage
            .write_signature_key_pair(public_key, signature_key_pair)
    }

    fn read_signature_key_pair<
        SignaturePublicKey: openmls_traits::types::SignaturePublicKey<CURRENT_VERSION>,
        SignatureKeyPair: openmls_traits::types::SignatureKeyPair<CURRENT_VERSION>,
    >(
        &self,
        public_key: &SignaturePublicKey,
    ) -> Result<Option<SignatureKeyPair>, Self::Error> {
        self.storage.read_signature_key_pair(public_key)
    }

    fn write_encryption_key_pair<
        HpkePublicKey: openmls_traits::types::HpkePublicKey<CURRENT_VERSION>,
        HpkeKeyPair: openmls_traits::types::HpkeKeyPair<CURRENT_VERSION>,
    >(
        &self,
        public_key: &HpkePublicKey,
        encryption_key_pair: &HpkeKeyPair,
    ) -> Result<(), Self::Error> {
        self.storage
            .write_encryption_key_pair(public_key, encryption_key_pair)
    }

    fn read_encryption_key_pair<
        HpkePublicKey: openmls_traits::types::HpkePublicKey<CURRENT_VERSION>,
        HpkeKeyPair: openmls_traits::types::HpkeKeyPair<CURRENT_VERSION>,
    >(
        &self,
        public_key: &HpkePublicKey,
    ) -> Result<Option<HpkeKeyPair>, Self::Error> {
        self.storage.read_encryption_key_pair(public_key)
    }

    fn write_encryption_epoch_key_pairs<
        GroupId: openmls_traits::types::GroupId<CURRENT_VERSION>,
        EpochKey: openmls_traits::types::EpochKey<CURRENT_VERSION>,
        HpkeKeyPair: openmls_traits::types::HpkeKeyPair<CURRENT_VERSION>,
    >(
        &self,
        group_id: &GroupId,
        epoch: &EpochKey,
        leaf_index: u32,
        key_pairs: &[HpkeKeyPair],
    ) -> Result<(), Self::Error> {
        self.storage
            .write_encryption_epoch_key_pairs(group_id, epoch, leaf_index, key_pairs)
    }

    fn read_encryption_epoch_key_pairs<
        GroupId: openmls_traits::types::GroupId<CURRENT_VERSION>,
        EpochKey: openmls_traits::types::EpochKey<CURRENT_VERSION>,
        HpkeKeyPair: openmls_traits::types::HpkeKeyPair<CURRENT_VERSION>,
    >(
        &self,
        group_id: &GroupId,
        epoch: &EpochKey,
        leaf_index: u32,
    ) -> Result<Vec<HpkeKeyPair>, Self::Error> {
        self.storage
            .read_encryption_epoch_key_pairs(group_id, epoch, leaf_index)
    }

    fn delete_encryption_epoch_key_pairs<
        GroupId: openmls_traits::types::GroupId<CURRENT_VERSION>,
        EpochKey: openmls_traits::types::EpochKey<CURRENT_VERSION>,
    >(
        &self,
        group_id: &GroupId,
        epoch: &EpochKey,
        leaf_index: u32,
    ) -> Result<(), Self::Error> {
        self.storage
            .delete_encryption_epoch_key_pairs(group_id, epoch, leaf_index)
    }

    fn write_psk<PskId: openmls_traits::types::PskId<CURRENT_VERSION>>(
        &self,
        psk_id: &PskId,
        psk: &openmls_traits::storage::PskBundle<CURRENT_VERSION>,
    ) -> Result<(), Self::Error> {
        self.storage.write_psk(psk_id, psk)
    }

    fn read_psk<PskId: openmls_traits::types::PskId<CURRENT_VERSION>>(
        &self,
        psk_id: &PskId,
    ) -> Result<Option<openmls_traits::storage::PskBundle<CURRENT_VERSION>>, Self::Error> {
        self.storage.read_psk(psk_id)
    }
}