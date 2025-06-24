use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize)]
pub struct MLSCommit {
    pub commit: Vec<u8>,
    pub welcome: Vec<Vec<u8>>,
}

#[derive(Serialize, Deserialize)]
pub struct MLSCiphertext {
    pub data: Vec<u8>,
    pub epoch: u64,
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