#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    local color=$1
    local message=$2
    echo -e "${color}${message}${NC}"
}

# Install wasm-pack if not already installed
if ! command -v wasm-pack &> /dev/null; then
    print_status $YELLOW "Installing wasm-pack..."
    curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh
fi

# Install wasm-opt if not already installed
if ! command -v wasm-opt &> /dev/null; then
    print_status $YELLOW "Installing wasm-opt..."
    npm install -g wasm-opt
fi

# Clean previous builds
print_status $YELLOW "Cleaning previous builds..."
rm -rf ../src/mls/wasm

# Build standard WASM module
print_status $GREEN "Building standard MLS WASM module..."
wasm-pack build --target web --out-dir ../src/mls/wasm --out-name mls

# Build SIMD-optimized version
print_status $GREEN "Building SIMD-optimized MLS WASM module..."
RUSTFLAGS="-C target-feature=+simd128" wasm-pack build --target web --out-dir ../src/mls/wasm-simd --out-name mls_simd --features simd

# Build parallel processing version (requires SharedArrayBuffer)
print_status $GREEN "Building parallel MLS WASM module..."
RUSTFLAGS="-C target-feature=+atomics,+bulk-memory,+mutable-globals" wasm-pack build --target web --out-dir ../src/mls/wasm-parallel --out-name mls_parallel --features parallel

# Optimize all WASM files
optimize_wasm() {
    local wasm_file=$1
    local output_file="${wasm_file%.wasm}_optimized.wasm"
    
    if [ -f "$wasm_file" ]; then
        print_status $YELLOW "Optimizing $(basename $wasm_file)..."
        
        # First pass: general optimizations
        wasm-opt -Oz \
            --enable-simd \
            --enable-threads \
            --enable-bulk-memory \
            --enable-mutable-globals \
            --enable-nontrapping-float-to-int \
            --enable-sign-ext \
            --enable-reference-types \
            --converge \
            --strip-debug \
            --strip-producers \
            "$wasm_file" -o "$output_file"
        
        # Second pass: aggressive optimizations
        wasm-opt -O4 \
            --precompute \
            --optimize-instructions \
            --optimize-for-size \
            --simplify-globals \
            --vacuum \
            --duplicate-function-elimination \
            --merge-blocks \
            --remove-unused-module-elements \
            --remove-unused-functions \
            --inline-main \
            "$output_file" -o "$wasm_file"
        
        # Clean up temporary file
        rm -f "$output_file"
        
        # Report size reduction
        local original_size=$(stat -f%z "$wasm_file" 2>/dev/null || stat -c%s "$wasm_file")
        print_status $GREEN "Optimized $(basename $wasm_file) - Size: $((original_size / 1024))KB"
    fi
}

# Optimize all generated WASM files
for wasm_dir in ../src/mls/wasm ../src/mls/wasm-simd ../src/mls/wasm-parallel; do
    if [ -d "$wasm_dir" ]; then
        optimize_wasm "$wasm_dir/"*_bg.wasm
    fi
done

# Generate feature detection script
print_status $YELLOW "Generating feature detection script..."
cat > ../src/mls/wasm-loader.js << 'EOF'
/**
 * WASM Feature Detection and Loader
 * Automatically selects the best WASM module based on browser capabilities
 */

export class WASMLoader {
    static async detectFeatures() {
        const features = {
            simd: false,
            threads: false,
            sharedMemory: false,
            bulkMemory: false
        };

        try {
            // Check SIMD support
            if (WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 17, 253, 98, 11]))) {
                features.simd = true;
            }

            // Check SharedArrayBuffer support (required for threads)
            if (typeof SharedArrayBuffer !== 'undefined') {
                features.sharedMemory = true;
                features.threads = true;
            }

            // Check bulk memory operations
            if (WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 4, 1, 96, 0, 0, 3, 2, 1, 0, 5, 3, 1, 0, 1, 10, 7, 1, 5, 0, 252, 8, 0, 0, 11]))) {
                features.bulkMemory = true;
            }
        } catch (e) {
            console.warn('Feature detection failed:', e);
        }

        return features;
    }

    static async loadOptimalModule() {
        const features = await this.detectFeatures();
        
        console.log('WASM Features detected:', features);

        // Select the best module based on available features
        if (features.threads && features.sharedMemory && features.bulkMemory) {
            console.log('Loading parallel WASM module...');
            return import('./wasm-parallel/mls_parallel.js');
        } else if (features.simd) {
            console.log('Loading SIMD-optimized WASM module...');
            return import('./wasm-simd/mls_simd.js');
        } else {
            console.log('Loading standard WASM module...');
            return import('./wasm/mls.js');
        }
    }
}

// Memory management utilities
export class WASMMemoryManager {
    constructor(module) {
        this.module = module;
        this.allocations = new Map();
    }

    allocate(size) {
        const ptr = this.module._malloc(size);
        this.allocations.set(ptr, size);
        return ptr;
    }

    free(ptr) {
        if (this.allocations.has(ptr)) {
            this.module._free(ptr);
            this.allocations.delete(ptr);
        }
    }

    freeAll() {
        for (const [ptr] of this.allocations) {
            this.module._free(ptr);
        }
        this.allocations.clear();
    }

    getUsedMemory() {
        let total = 0;
        for (const [_, size] of this.allocations) {
            total += size;
        }
        return total;
    }
}
EOF

print_status $GREEN "Build complete!"

# Display build summary
echo ""
print_status $GREEN "=== Build Summary ==="
print_status $NC "Standard module: ../src/mls/wasm/"
print_status $NC "SIMD module: ../src/mls/wasm-simd/"
print_status $NC "Parallel module: ../src/mls/wasm-parallel/"
print_status $NC "Feature loader: ../src/mls/wasm-loader.js"