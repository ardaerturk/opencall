import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { visualizer } from 'rollup-plugin-visualizer';
import viteCompression from 'vite-plugin-compression';
import { ViteImageOptimizer } from 'vite-plugin-image-optimizer';
import path from 'path';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const isProduction = mode === 'production';
  const useCDN = env.VITE_USE_CDN === 'true';

  return {
    plugins: [
      react({
        babel: {
          plugins: [
            ['@babel/plugin-transform-react-constant-elements'],
            ['@babel/plugin-transform-react-inline-elements'],
          ],
        },
      }),
      
      // PWA configuration
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'mask-icon.svg'],
        manifest: {
          name: 'OpenCall',
          short_name: 'OpenCall',
          description: 'Open source, peer-to-peer video conferencing with end-to-end encryption',
          theme_color: '#000000',
          background_color: '#ffffff',
          display: 'standalone',
          orientation: 'portrait',
          scope: '/',
          start_url: '/',
          icons: [
            {
              src: 'pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
            },
            {
              src: 'pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
            },
            {
              src: 'pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any maskable',
            },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2,wasm}'],
          maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // 5MB
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              urlPattern: /^https:\/\/cdn\.jsdelivr\.net\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'cdn-cache',
                expiration: {
                  maxEntries: 50,
                  maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              urlPattern: /\.wasm$/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'wasm-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
          ],
        },
        devOptions: {
          enabled: !isProduction,
        },
      }),

      // Compression plugin for gzip and brotli
      viteCompression({
        algorithm: 'gzip',
        ext: '.gz',
        threshold: 10240, // 10KB
        deleteOriginFile: false,
      }),
      viteCompression({
        algorithm: 'brotliCompress',
        ext: '.br',
        threshold: 10240, // 10KB
        deleteOriginFile: false,
      }),

      // Image optimization
      ViteImageOptimizer({
        png: {
          quality: 80,
        },
        jpeg: {
          quality: 80,
        },
        jpg: {
          quality: 80,
        },
        webp: {
          lossless: false,
          quality: 80,
        },
      }),

      // Bundle analyzer in production
      isProduction && visualizer({
        filename: './dist/stats.html',
        open: false,
        gzipSize: true,
        brotliSize: true,
      }),
    ].filter(Boolean),

    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },

    server: {
      port: 3000,
      host: true,
      headers: {
        'Cross-Origin-Embedder-Policy': 'require-corp',
        'Cross-Origin-Opener-Policy': 'same-origin',
      },
    },

    build: {
      target: 'es2020',
      minify: isProduction ? 'terser' : false,
      sourcemap: !isProduction,
      cssCodeSplit: true,
      reportCompressedSize: false,
      chunkSizeWarningLimit: 1000,
      
      terserOptions: {
        compress: {
          drop_console: isProduction,
          drop_debugger: isProduction,
          pure_funcs: isProduction ? ['console.log', 'console.info'] : [],
        },
        mangle: {
          safari10: true,
        },
        format: {
          comments: false,
        },
      },

      rollupOptions: {
        output: {
          format: 'es',
          entryFileNames: isProduction ? '[name].[hash].js' : '[name].js',
          chunkFileNames: isProduction ? '[name].[hash].js' : '[name].js',
          assetFileNames: isProduction ? '[name].[hash].[ext]' : '[name].[ext]',
          
          manualChunks: (id) => {
            // Core vendor chunks
            if (id.includes('node_modules')) {
              if (id.includes('react') || id.includes('react-dom') || id.includes('react-router')) {
                return 'react-vendor';
              }
              if (id.includes('mediasoup') || id.includes('simple-peer') || id.includes('webrtc')) {
                return 'webrtc-vendor';
              }
              if (id.includes('encryption') || id.includes('crypto') || id.includes('openmls')) {
                return 'crypto-vendor';
              }
              if (id.includes('@tanstack') || id.includes('zustand') || id.includes('immer')) {
                return 'state-vendor';
              }
              if (id.includes('chart') || id.includes('d3') || id.includes('vis')) {
                return 'visualization-vendor';
              }
              // Default vendor chunk for other dependencies
              return 'vendor';
            }
            
            // Feature-based chunks
            if (id.includes('src/components/collaboration')) {
              return 'collaboration';
            }
            if (id.includes('src/components/meeting')) {
              return 'meeting';
            }
            if (id.includes('src/services/encryption')) {
              return 'encryption';
            }
            if (id.includes('src/services/mediasoup')) {
              return 'mediasoup';
            }
          },
        },
        
        // External dependencies for CDN
        external: useCDN ? [
          'react',
          'react-dom',
          'react-router-dom',
        ] : [],
      },
    },

    optimizeDeps: {
      include: [
        'react',
        'react-dom',
        'react-router-dom',
        'simple-peer',
        'mediasoup-client',
      ],
      exclude: ['@opencall/protocol'],
      esbuildOptions: {
        target: 'es2020',
      },
    },

    // Performance optimizations
    esbuild: {
      legalComments: 'none',
      treeShaking: true,
    },

    // CDN configuration
    ...(useCDN && {
      build: {
        rollupOptions: {
          external: ['react', 'react-dom', 'react-router-dom'],
          output: {
            globals: {
              react: 'React',
              'react-dom': 'ReactDOM',
              'react-router-dom': 'ReactRouterDOM',
            },
            paths: {
              react: 'https://cdn.jsdelivr.net/npm/react@18/umd/react.production.min.js',
              'react-dom': 'https://cdn.jsdelivr.net/npm/react-dom@18/umd/react-dom.production.min.js',
              'react-router-dom': 'https://cdn.jsdelivr.net/npm/react-router-dom@6/dist/react-router-dom.production.min.js',
            },
          },
        },
      },
    }),
  };
});