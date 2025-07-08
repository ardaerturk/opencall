# OpenCall MLS (Messaging Layer Security) Implementation

This directory contains the MLS protocol implementation for OpenCall, providing end-to-end encryption for group communications.

## Overview

The MLS implementation is built using:
- **Rust** with the OpenMLS library for core cryptographic operations
- **WebAssembly** for browser compatibility
- **TypeScript** bindings for easy integration with the OpenCall client

## Architecture

```
mls/
├── client.ts         # TypeScript client wrapper
├── types.ts          # TypeScript type definitions
├── storage.ts        # IndexedDB storage provider
└── wasm/            # Generated WASM bindings (built from Rust)
```

## Building the WASM Module

From the `packages/protocol` directory:

```bash
npm run build:wasm
```

This will:
1. Compile the Rust code to WebAssembly
2. Generate TypeScript bindings
3. Optimize the WASM output

## Usage

### Initializing the MLS Client

```typescript
import { MLSClient } from '@opencall/protocol';

const client = new MLSClient({
  identity: 'user@example.com',
  storageProvider: new IndexedDBMLSStorage('opencall-mls')
});

await client.initialize();
```

### Creating a Group

```typescript
const group = await client.createGroup('my-secure-room');
```

### Adding Members

```typescript
// Member exports their key package
const keyPackage = await newMember.exportKeyPackage();

// Group admin adds the member
const commit = await group.addMember(keyPackage);

// Send commit.welcome to the new member
// The new member joins using:
const memberGroup = await newMember.joinGroup(commit.welcome[0]);
```

### Encrypting Messages

```typescript
const plaintext = new TextEncoder().encode('Hello, secure world!');
const ciphertext = await group.encrypt(plaintext);

// Send ciphertext to all group members
```

### Decrypting Messages

```typescript
const plaintext = await group.decrypt(ciphertext);
const message = new TextDecoder().decode(plaintext);
```

### Removing Members

```typescript
const commit = await group.removeMember('user-id');
// Distribute commit.commit to remaining members
```

## Key Features

- **Forward Secrecy**: Keys are rotated on every membership change
- **Post-Compromise Security**: Compromised members cannot decrypt future messages after removal
- **Efficient Group Operations**: Logarithmic complexity for adding/removing members
- **Browser-Optimized**: WASM module is optimized for size and performance

## Storage

The implementation supports pluggable storage providers. The default `IndexedDBMLSStorage` persists:
- Key packages
- Group states
- Cryptographic material

## Security Considerations

1. **Identity Verification**: The application layer should verify member identities before adding them to groups
2. **Welcome Message Distribution**: Welcome messages contain sensitive key material and must be transmitted securely
3. **Commit Distribution**: All group members must receive and process commits to maintain synchronization

## Testing

Run the tests:

```bash
# TypeScript tests
npm test

# Rust/WASM tests
cd wasm && wasm-pack test --browser
```

## Performance

The WASM module is optimized for:
- Small binary size (~200KB gzipped)
- Fast encryption/decryption operations
- Efficient memory usage in browser environments

## Troubleshooting

### WASM Module Failed to Load

Ensure your web server serves `.wasm` files with the correct MIME type:
```
Content-Type: application/wasm
```

### Storage Errors

Clear IndexedDB storage if you encounter persistence issues:
```typescript
const storage = new IndexedDBMLSStorage('opencall-mls');
await storage.clear(); // Implement if needed
```