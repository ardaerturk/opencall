#!/bin/bash

# Install wasm-pack if not already installed
if ! command -v wasm-pack &> /dev/null; then
    echo "Installing wasm-pack..."
    curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh
fi

# Build the WASM module
echo "Building MLS WASM module..."
wasm-pack build --target web --out-dir ../src/mls/wasm --out-name mls

# Optimize the WASM file
if command -v wasm-opt &> /dev/null; then
    echo "Optimizing WASM..."
    wasm-opt -Oz ../src/mls/wasm/mls_bg.wasm -o ../src/mls/wasm/mls_bg.wasm
fi

echo "Build complete!"