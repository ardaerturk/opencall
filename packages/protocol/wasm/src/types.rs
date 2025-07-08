use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
#[derive(Serialize, Deserialize, Clone)]
pub struct MLSCommit {
    pub(crate) commit: Vec<u8>,
    pub(crate) welcome: Vec<Vec<u8>>,
}

#[wasm_bindgen]
impl MLSCommit {
    #[wasm_bindgen(getter)]
    pub fn commit(&self) -> Vec<u8> {
        self.commit.clone()
    }

    #[wasm_bindgen(getter)]
    pub fn welcome(&self) -> Vec<js_sys::Uint8Array> {
        self.welcome
            .iter()
            .map(|w| js_sys::Uint8Array::from(w.as_slice()))
            .collect()
    }
}

#[wasm_bindgen]
#[derive(Serialize, Deserialize, Clone)]
pub struct MLSCiphertext {
    pub(crate) data: Vec<u8>,
    pub(crate) epoch: u64,
}

#[wasm_bindgen]
impl MLSCiphertext {
    #[wasm_bindgen(constructor)]
    pub fn new(data: Vec<u8>, epoch: u64) -> Self {
        Self { data, epoch }
    }

    #[wasm_bindgen(getter)]
    pub fn data(&self) -> Vec<u8> {
        self.data.clone()
    }

    #[wasm_bindgen(getter)]
    pub fn epoch(&self) -> u64 {
        self.epoch
    }
}

#[derive(Serialize, Deserialize)]
pub struct GroupInfo {
    pub id: String,
    pub epoch: u64,
    pub members: Vec<MemberInfo>,
}

#[derive(Serialize, Deserialize)]
pub struct MemberInfo {
    pub id: String,
    pub credential: Vec<u8>,
    pub added_at_epoch: u64,
}

#[derive(Serialize, Deserialize)]
pub struct MLSWelcome {
    pub data: Vec<u8>,
}

#[derive(Serialize, Deserialize)]
pub struct MLSKeyPackage {
    pub data: Vec<u8>,
}