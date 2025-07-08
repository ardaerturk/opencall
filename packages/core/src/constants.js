"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HEARTBEAT_INTERVAL_MS = exports.CONNECTION_TIMEOUT_MS = exports.ICE_GATHERING_TIMEOUT_MS = exports.FILE_SIZE_LIMIT = exports.MESSAGE_SIZE_LIMIT = exports.MLS_CIPHERSUITE = exports.SKALE_RPC_ENDPOINT = exports.SKALE_CHAIN_NAME = exports.IPFS_API_URL = exports.IPFS_GATEWAY_URL = exports.LIBP2P_BOOTSTRAP_NODES = exports.DEFAULT_STUN_SERVERS = exports.FREE_TIER_DURATION_MINUTES = exports.FREE_TIER_PARTICIPANT_LIMIT = exports.P2P_PARTICIPANT_LIMIT = exports.APP_VERSION = exports.APP_NAME = void 0;
exports.APP_NAME = 'OpenCall';
exports.APP_VERSION = '0.1.0';
exports.P2P_PARTICIPANT_LIMIT = 3;
exports.FREE_TIER_PARTICIPANT_LIMIT = 8;
exports.FREE_TIER_DURATION_MINUTES = 60;
exports.DEFAULT_STUN_SERVERS = [
    'stun:stun.l.google.com:19302',
    'stun:stun1.l.google.com:19302',
    'stun:stun2.l.google.com:19302',
    'stun:stun3.l.google.com:19302',
    'stun:stun4.l.google.com:19302',
];
exports.LIBP2P_BOOTSTRAP_NODES = [
    '/dnsaddr/bootstrap.libp2p.io/p2p/QmNnooDu7bfjPFoTZYxMNLWUQJyrVwtbZg5gBMjTezGAJN',
    '/dnsaddr/bootstrap.libp2p.io/p2p/QmQCU2EcMqAqQPR2i9bChDtGNJchTbq5TbXJJ16u19uLTa',
];
exports.IPFS_GATEWAY_URL = 'https://ipfs.io';
exports.IPFS_API_URL = '/ip4/127.0.0.1/tcp/5001';
exports.SKALE_CHAIN_NAME = 'opencall-chain';
exports.SKALE_RPC_ENDPOINT = process.env['SKALE_ENDPOINT'] || '';
exports.MLS_CIPHERSUITE = 'MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519';
exports.MESSAGE_SIZE_LIMIT = 16 * 1024;
exports.FILE_SIZE_LIMIT = 100 * 1024 * 1024;
exports.ICE_GATHERING_TIMEOUT_MS = 5000;
exports.CONNECTION_TIMEOUT_MS = 30000;
exports.HEARTBEAT_INTERVAL_MS = 15000;
//# sourceMappingURL=constants.js.map