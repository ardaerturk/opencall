export const APP_NAME = 'OpenCall';
export const APP_VERSION = '0.1.0';

export const P2P_PARTICIPANT_LIMIT = 3;
export const FREE_TIER_PARTICIPANT_LIMIT = 8;
export const FREE_TIER_DURATION_MINUTES = 60;

export const DEFAULT_STUN_SERVERS = [
  'stun:stun.l.google.com:19302',
  'stun:stun1.l.google.com:19302',
  'stun:stun2.l.google.com:19302',
  'stun:stun3.l.google.com:19302',
  'stun:stun4.l.google.com:19302',
];

export const LIBP2P_BOOTSTRAP_NODES = [
  '/dnsaddr/bootstrap.libp2p.io/p2p/QmNnooDu7bfjPFoTZYxMNLWUQJyrVwtbZg5gBMjTezGAJN',
  '/dnsaddr/bootstrap.libp2p.io/p2p/QmQCU2EcMqAqQPR2i9bChDtGNJchTbq5TbXJJ16u19uLTa',
];

export const IPFS_GATEWAY_URL = 'https://ipfs.io';
export const IPFS_API_URL = '/ip4/127.0.0.1/tcp/5001';

export const SKALE_CHAIN_NAME = 'opencall-chain';
export const SKALE_RPC_ENDPOINT = process.env['SKALE_ENDPOINT'] || '';

export const MLS_CIPHERSUITE = 'MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519';

export const MESSAGE_SIZE_LIMIT = 16 * 1024;
export const FILE_SIZE_LIMIT = 100 * 1024 * 1024;

export const ICE_GATHERING_TIMEOUT_MS = 5000;
export const CONNECTION_TIMEOUT_MS = 30000;
export const HEARTBEAT_INTERVAL_MS = 15000;