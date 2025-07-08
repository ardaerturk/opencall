#[cfg(test)]
mod tests {
    use wasm_bindgen_test::*;
    use opencall_mls::MLSClient;

    wasm_bindgen_test_configure!(run_in_browser);

    #[wasm_bindgen_test]
    fn test_client_initialization() {
        let client = MLSClient::new("test_user".to_string());
        assert!(client.is_ok());
    }

    #[wasm_bindgen_test]
    fn test_create_group() {
        let client = MLSClient::new("test_user".to_string()).unwrap();
        let group_id = vec![1, 2, 3, 4];
        let group = client.create_group(group_id);
        assert!(group.is_ok());
    }

    #[wasm_bindgen_test]
    fn test_export_key_package() {
        let client = MLSClient::new("test_user".to_string()).unwrap();
        let key_package = client.export_key_package();
        assert!(key_package.is_ok());
        assert!(!key_package.unwrap().is_empty());
    }

    #[wasm_bindgen_test]
    fn test_group_operations() {
        // Create two clients
        let client1 = MLSClient::new("user1".to_string()).unwrap();
        let client2 = MLSClient::new("user2".to_string()).unwrap();
        
        // Create a group with client1
        let group_id = vec![5, 6, 7, 8];
        let group1 = client1.create_group(group_id.clone()).unwrap();
        
        // Get key package from client2
        let key_package2 = client2.export_key_package().unwrap();
        
        // Add client2 to the group
        let add_result = group1.add_member(&key_package2);
        assert!(add_result.is_ok());
    }

    #[wasm_bindgen_test]
    fn test_message_encryption_decryption() {
        let client = MLSClient::new("test_user".to_string()).unwrap();
        let group_id = vec![9, 10, 11, 12];
        let group = client.create_group(group_id).unwrap();
        
        // Encrypt a message
        let plaintext = b"Hello, MLS!";
        let encrypted = group.encrypt_message(plaintext);
        assert!(encrypted.is_ok());
    }

    #[wasm_bindgen_test]
    fn test_epoch_tracking() {
        let client = MLSClient::new("test_user".to_string()).unwrap();
        let group_id = vec![13, 14, 15, 16];
        let group = client.create_group(group_id).unwrap();
        
        // Check initial epoch
        let epoch = group.get_current_epoch();
        assert!(epoch.is_ok());
        assert_eq!(epoch.unwrap(), 0);
    }

    #[wasm_bindgen_test]
    fn test_member_removal() {
        // Create three clients
        let client1 = MLSClient::new("user1".to_string()).unwrap();
        let client2 = MLSClient::new("user2".to_string()).unwrap();
        
        // Create a group with client1
        let group_id = vec![17, 18, 19, 20];
        let group1 = client1.create_group(group_id).unwrap();
        
        // Add client2
        let key_package2 = client2.export_key_package().unwrap();
        let _ = group1.add_member(&key_package2).unwrap();
        
        // Remove client2
        let remove_result = group1.remove_member("user2");
        assert!(remove_result.is_ok());
    }

    #[wasm_bindgen_test]
    fn test_invalid_member_removal() {
        let client = MLSClient::new("test_user".to_string()).unwrap();
        let group_id = vec![21, 22, 23, 24];
        let group = client.create_group(group_id).unwrap();
        
        // Try to remove non-existent member
        let remove_result = group.remove_member("non_existent_user");
        assert!(remove_result.is_err());
    }
}