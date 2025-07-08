const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

/**
 * Optimize WebAssembly modules for production
 */

const WASM_DIR = path.join(__dirname, 'src/mls/wasm');
const WASM_FILE = path.join(WASM_DIR, 'mls_wasm_bg.wasm');

console.log('🔧 Starting WASM optimization...');

// Check if wasm-opt is installed
try {
  execSync('wasm-opt --version', { stdio: 'pipe' });
} catch (error) {
  console.error('❌ wasm-opt not found. Please install it:');
  console.error('npm install -g wasm-opt');
  process.exit(1);
}

// Check if WASM file exists
if (!fs.existsSync(WASM_FILE)) {
  console.error(`❌ WASM file not found at: ${WASM_FILE}`);
  console.error('Please build the WASM module first: npm run build:wasm');
  process.exit(1);
}

// Get original file size
const originalSize = fs.statSync(WASM_FILE).size;
console.log(`📊 Original size: ${(originalSize / 1024).toFixed(2)} KB`);

// Optimization levels to try
const optimizations = [
  {
    name: 'Size optimization',
    flags: '-Oz',
    output: 'mls_wasm_bg.opt.wasm',
  },
  {
    name: 'Size + Low memory',
    flags: '-Oz --low-memory-unused --zero-filled-memory',
    output: 'mls_wasm_bg.opt2.wasm',
  },
  {
    name: 'Aggressive optimization',
    flags: '-O3 --enable-simd',
    output: 'mls_wasm_bg.perf.wasm',
  },
];

let bestSize = originalSize;
let bestFile = WASM_FILE;

// Try each optimization
for (const opt of optimizations) {
  console.log(`\n🚀 Trying ${opt.name}...`);
  
  const outputFile = path.join(WASM_DIR, opt.output);
  const command = `wasm-opt ${opt.flags} ${WASM_FILE} -o ${outputFile}`;
  
  try {
    execSync(command, { stdio: 'pipe' });
    
    const newSize = fs.statSync(outputFile).size;
    const reduction = ((originalSize - newSize) / originalSize * 100).toFixed(2);
    
    console.log(`✅ Size: ${(newSize / 1024).toFixed(2)} KB (${reduction}% reduction)`);
    
    if (newSize < bestSize) {
      bestSize = newSize;
      bestFile = outputFile;
    }
  } catch (error) {
    console.error(`❌ Failed: ${error.message}`);
  }
}

// Use the best optimization
if (bestFile !== WASM_FILE) {
  console.log(`\n🎉 Best optimization: ${path.basename(bestFile)}`);
  console.log(`📦 Final size: ${(bestSize / 1024).toFixed(2)} KB`);
  
  // Replace original with optimized version
  fs.copyFileSync(bestFile, WASM_FILE);
  
  // Clean up temporary files
  for (const opt of optimizations) {
    const tempFile = path.join(WASM_DIR, opt.output);
    if (fs.existsSync(tempFile)) {
      fs.unlinkSync(tempFile);
    }
  }
}

// Additional optimizations
console.log('\n🔍 Analyzing WASM module...');

// Check for unused exports
const wasmInfo = execSync(`wasm-opt ${WASM_FILE} --print`, { encoding: 'utf8' });
const exportCount = (wasmInfo.match(/\(export/g) || []).length;
console.log(`📤 Exports: ${exportCount}`);

// Generate optimization report
const report = {
  originalSize,
  optimizedSize: bestSize,
  reduction: ((originalSize - bestSize) / originalSize * 100).toFixed(2) + '%',
  exportCount,
  timestamp: new Date().toISOString(),
};

fs.writeFileSync(
  path.join(WASM_DIR, 'optimization-report.json'),
  JSON.stringify(report, null, 2)
);

console.log('\n✨ WASM optimization complete!');
console.log(`📄 Report saved to: ${path.join(WASM_DIR, 'optimization-report.json')}`);

// Performance benchmarking script
const benchmarkCode = `
// Benchmark WASM performance
import { MLSClient } from './mls_wasm.js';

async function benchmark() {
  const iterations = 1000;
  const client = new MLSClient();
  
  // Initialize
  console.time('Initialize');
  await client.initialize('benchmark-user');
  console.timeEnd('Initialize');
  
  // Key generation
  console.time('Generate ${iterations} key packages');
  for (let i = 0; i < iterations; i++) {
    await client.exportKeyPackage();
  }
  console.timeEnd('Generate ${iterations} key packages');
  
  // Group creation
  const groupId = 'benchmark-group';
  console.time('Create group');
  await client.createGroup(groupId);
  console.timeEnd('Create group');
  
  // Message encryption
  const message = new TextEncoder().encode('Hello, World!');
  console.time('Encrypt ${iterations} messages');
  for (let i = 0; i < iterations; i++) {
    await client.encryptMessage(groupId, message);
  }
  console.timeEnd('Encrypt ${iterations} messages');
}

benchmark().catch(console.error);
`;

fs.writeFileSync(
  path.join(WASM_DIR, 'benchmark.js'),
  benchmarkCode
);

console.log(`📊 Benchmark script created: ${path.join(WASM_DIR, 'benchmark.js')}`);