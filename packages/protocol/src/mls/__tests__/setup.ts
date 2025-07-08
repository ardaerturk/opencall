// Mock WebAssembly module for testing
global.WebAssembly = {
  Module: class Module {},
  Instance: class Instance {},
  Memory: class Memory {},
  Table: class Table {},
  CompileError: class CompileError extends Error {},
  LinkError: class LinkError extends Error {},
  RuntimeError: class RuntimeError extends Error {},
  instantiate: async () => ({ instance: {}, module: {} }),
  compile: async () => ({}),
  validate: () => true,
  instantiateStreaming: async () => ({ instance: {}, module: {} }),
} as any;

// Mock crypto.getRandomValues for tests
if (!global.crypto) {
  global.crypto = {
    getRandomValues: (array: Uint8Array) => {
      for (let i = 0; i < array.length; i++) {
        array[i] = Math.floor(Math.random() * 256);
      }
      return array;
    },
  } as any;
}