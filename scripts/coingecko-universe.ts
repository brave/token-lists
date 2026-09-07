/**
 * ╔════════════════════════════════════════════════════════════════════════════╗
 * ║                        CoinGecko Universe Generator                        ║
 * ╚════════════════════════════════════════════════════════════════════════════╝
 *
 * This script generates a JSON object containing the universe of all tokens
 * available on CoinGecko, indexed by chain id and contract address to allow
 * for fast lookups.
 *
 *    {
 *      "0x65": {                                                 ← Chain ID ("0x65"=Solana Mainnet Beta)
 *        "So11111111111111111111111111111111111111112": {        ← SPL token program address
 *          name: "Wrapped SOL",                                ┐
 *          symbol: "SOL",                                      │
 *          decimals: 9,                                        │
 *          logo: "...",                                        ├ ← Token metadata
 *          coingeckoId: "wrapped-solana",                      │
 *          rank: 9                                             ┘
 *        }
 *      },
 *      "0x1": {                                                  ← Chain ID ("0x1"=Ethereum Mainnet)
 *        "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599": {         ← ERC20 contract address
 *          name: "Wrapped BTC",                                ┐
 *          symbol: "WBTC",                                     │
 *          decimals: 8,                                        │
 *          logo: "...",                                        ├ ← Token metadata
 *          coingeckoId: "wrapped-bitcoin",                     │
 *          rank: 1                                             ┘
 *        }
 *      },
 *      "0xa": {                                                  ← Chain ID ("0xa"=Optimism)
 *        "0x4200000000000000000000000000000000000006": {         ← ERC20 contract address
 *          name: "Wrapped ETH",                                ┐
 *          symbol: "WETH",                                     │
 *          decimals: 18,                                       │
 *          logo: "...",                                        ├ ← Token metadata
 *          coingeckoId: "weth",                                │
 *          rank: 2                                             ┘
 *        }
 *      },
 *      "polkadot_asset_hub": {                                   ← Chain ID ("polkadot_asset_hub"=Polkadot Asset Hub)
 *        "1337": {                                               ← Asset Hub integer asset ID
 *          name: "USDC",                                       ┐
 *          symbol: "USDC",                                     │
 *          decimals: 6,                                        │
 *          logo: "...",                                        ├ ← Token metadata
 *          coingeckoId: "usd-coin",                            │
 *          rank: 7                                             ┘
 *        }
 *      }
 *    }
 *
 * Contract and program addresses are case-sensitive and encoded in their
 * respective canonical forms:
 *   - Ethereum addresses follow EIP-55 checksum encoding
 *   - Solana addresses use their base58 representation
 *   - Polkadot Asset Hub assets use their integer asset ID (as a string)
 */
import util from 'node:util';
import fs from 'node:fs';

import { ethers } from 'ethers';
import {
  address as solanaAddress,
  createSolanaRpc,
} from '@solana/kit';
import { fetchMint } from '@solana-program/token';
import { fetchMint as fetchMint2022 } from '@solana-program/token-2022';

import coingecko, { type AssetPlatform } from './lib/coingecko';
import { sortTokenListJson } from './util';
import rawBlacklist from '../data/blacklist.json' with { type: 'json' };

// Normalize blacklist entries to lowercase on load. EVM addresses are stored
// lowercase throughout this repo; Solana/Cardano addresses don't collide in
// case, so a uniform lowercase comparison is safe.
const blacklist: Record<string, Set<string>> = Object.fromEntries(
  Object.entries(rawBlacklist as Record<string, string[]>).map(([chainId, addresses]) => [
    chainId,
    new Set(addresses.map(a => a.toLowerCase())),
  ]),
);

const isBlacklisted = (chainId: string, address: string): boolean =>
  blacklist[chainId]?.has(address.toLowerCase()) ?? false;

// Enable colors in util.inspect
util.inspect.defaultOptions.colors = true;

type Result = Record<string, Record<string, {
  name: string;
  symbol: string;
  coingeckoId: string;
  decimals: number;
  logo: string;
  token2022?: boolean;
}>>;

type TokenInfo = {
  token2022?: boolean;
  symbol?: string;
  decimals?: number;
};

// The enum fields indicate the chain IDs that we support.
//
// The current criteria for inclusion is as follows:
//   - The chain must be top 10 by TVL on DefiLlama
//   - The chain must have native USDC token
//
// Chain IDs must stay in sync with brave-core's brave_wallet.mojom:
// https://github.com/brave/brave-core/blob/master/components/brave_wallet/common/brave_wallet.mojom
enum ChainId {
  ETHEREUM = '0x1',
  BSC = '0x38', 
  ARBITRUM = '0xa4b1',
  BASE = '0x2105',
  POLYGON = '0x89',
  OPTIMISM = '0xa',
  AVALANCHE = '0xa86a',
  SOLANA = '0x65',
  NEAR_PROTOCOL_EVM = '0x18d',

  TEMPO = '0x1079',

  CARDANO = 'cardano_mainnet',

  POLKADOT = 'polkadot_asset_hub',

  // Disabled for now
  // ZKSYNC = '0x144',
}

function validateEnvVars() {
  const requiredVars = [
    'ETHEREUM_RPC_URL',
    'BSC_RPC_URL',
    'ARBITRUM_RPC_URL',
    'BASE_RPC_URL',
    'POLYGON_RPC_URL',
    'OPTIMISM_RPC_URL',
    'AVALANCHE_RPC_URL',
    'SOLANA_RPC_URL',

    // Disabled for now
    // 'ZKSYNC_RPC_URL',
  ];

  const missing = requiredVars.filter(v => !process.env[v]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

function loadRpcConfig(): Record<ChainId, string> {
  validateEnvVars();

  return {
    [ChainId.ETHEREUM]: process.env.ETHEREUM_RPC_URL!,
    [ChainId.BSC]: process.env.BSC_RPC_URL!,
    [ChainId.ARBITRUM]: process.env.ARBITRUM_RPC_URL!,
    [ChainId.BASE]: process.env.BASE_RPC_URL!,
    [ChainId.POLYGON]: process.env.POLYGON_RPC_URL!,
    [ChainId.OPTIMISM]: process.env.OPTIMISM_RPC_URL!,
    [ChainId.AVALANCHE]: process.env.AVALANCHE_RPC_URL!,
    [ChainId.SOLANA]: process.env.SOLANA_RPC_URL!,
    [ChainId.NEAR_PROTOCOL_EVM]: 'https://eth-rpc.mainnet.near.org',
    [ChainId.TEMPO]: 'https://rpc.tempo.xyz',

    // Cardano RPC URL is unused for now
    [ChainId.CARDANO]: "",

    // Polkadot Asset Hub decimals are sourced from CoinGecko; no RPC needed.
    [ChainId.POLKADOT]: ""

    // Disabled for now
    // [ChainId.ZKSYNC]: process.env.ZKSYNC_RPC_URL!,
  } as const;
}

const rpcConfig = loadRpcConfig();

const getPlatformChainId = (platform: AssetPlatform): ChainId | undefined => {
  // Handle special cases for networks that don't use chain identifiers
  if (platform.id === "solana") {
    return ChainId.SOLANA;
  }

  if (platform.id === "near-protocol") {
    return ChainId.NEAR_PROTOCOL_EVM;
  }

  if (platform.id === "cardano") {
    return ChainId.CARDANO;
  }

  if (platform.id === "polkadot") {
    return ChainId.POLKADOT;
  }

  // Tempo has no chain_identifier on CoinGecko despite being an EVM chain.
  if (platform.id === "tempo") {
    return ChainId.TEMPO;
  }

  // For other chains, convert numeric chain ID to hex string
  if (platform.chain_identifier) {
    const chainIdHex = `0x${platform.chain_identifier.toString(16)}`;
    
    // Return the chain ID if it's one we support
    if (Object.values(ChainId).includes(chainIdHex as ChainId)) {
      return chainIdHex as ChainId;
    }
  }

  return undefined;
};

const isEVMAddress = (address: string) => {
  return address.startsWith("0x") && address.length === 42;
};

// Convert a NEAR account ID to an EVM address using NEP-518 standard
function nearToEvmAddress(nearAccountId: string): string {
  // Compute Keccak-256 hash of the UTF-8 bytes of the account ID
  const hash = ethers.keccak256(ethers.toUtf8Bytes(nearAccountId));
  // Take the last 40 hex chars (20 bytes) and apply EIP-55 checksum
  const evmAddress = ethers.getAddress('0x' + hash.slice(-40));
  return evmAddress;
}

// Fetch token metadata from Cardano Token Registry
// Ref: https://developers.cardano.org/docs/build/native-tokens/cardano-token-registry/
const getTokenInfoFromCardanoRegistry = async (address: string): Promise<TokenInfo> => {
  const response = await fetch(
    `https://raw.githubusercontent.com/cardano-foundation/cardano-token-registry/refs/heads/master/mappings/${address}.json`
  );
  if (!response.ok) {
    throw new Error(`Failed to fetch ${address} from Cardano registry: ${response.statusText}`);
  }

  const data = (await response.json()) as {
    ticker?: { value?: string };
    decimals?: { value?: number };
  } | null;
  if (!data) {
    throw new Error(`No data found for ${address} in Cardano registry`);
  }

  const symbol = data.ticker?.value;
  const decimals = data.decimals?.value;

  if (!symbol || !decimals) {
    throw new Error(`No symbol or decimals found for ${address} in Cardano registry`);
  }

  return {
    decimals,
    symbol,
    token2022: undefined,
  };
};

const getTokenInfoFromChain = async (chainId: ChainId, address: string): Promise<TokenInfo> => {
  const rpcUrl = rpcConfig[chainId];

  if (chainId === ChainId.SOLANA) {
    const rpc = createSolanaRpc(rpcUrl);
    const mintPubkey = solanaAddress(address);

    try {
      // First try standard SPL Token program
      const mintInfo = await fetchMint(rpc, mintPubkey);
      return {
        decimals: mintInfo.data.decimals,
        symbol: undefined,
        token2022: undefined,
      };
    } catch (_error) {
      // If standard SPL Token fails, try Token-2022 program
      const mintInfo = await fetchMint2022(rpc, mintPubkey);
      return {
        decimals: mintInfo.data.decimals,
        symbol: undefined,
        token2022: true,
      };
    }
  }

  if (chainId === ChainId.CARDANO) {
    return await getTokenInfoFromCardanoRegistry(address);
  }

  // Polkadot Asset Hub assets are identified by integer asset IDs (not contract
  // addresses) and have no EVM RPC here. Returning undefined decimals defers to
  // CoinGecko via getTokenInfo's getTokenDecimalsFromCoingecko fallback.
  if (chainId === ChainId.POLKADOT) {
    return { decimals: undefined, symbol: undefined, token2022: undefined };
  }

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const contract = new ethers.Contract(
    address,
    [
      'function decimals() view returns (uint8)',
      'function symbol() view returns (string)'
    ],
    provider,
  );

  let symbol: string | undefined;
  try {
    symbol = await contract.symbol();
  } catch (_error) {
    // Symbol is optional, so we continue without it
  }

  let decimals: number | undefined;
  try {
    decimals = Number(await contract.decimals());
  } catch (_error) {
    // Decimals is optional, so we continue without it
  }

  return {
    decimals,
    symbol,
    token2022: undefined
  };
};

const getTokenDecimalsFromCoingecko = async (coinId: string, platformId: string): Promise<number> => {
  const coinDetails = await coingecko.getCoinDetails(coinId);
  const platformData = coinDetails.detail_platforms[platformId];

  if (!platformData || platformData.decimal_place === undefined) {
    throw new Error(`No decimal_place found for ${coinId} on platform ${platformId}`);
  }

  return platformData.decimal_place;
};

const getTokenInfo = async (
  chainId: ChainId,
  address: string,
  coinId: string,
  platformId: string
): Promise<TokenInfo> => {
  // First try to get token info from the blockchain
  try {
    const onchainInfo = await getTokenInfoFromChain(chainId, address);

    // If we got decimals from chain, return the full info
    if (onchainInfo.decimals !== undefined) {
      return onchainInfo;
    }

    // If no decimals from chain, try CoinGecko
    const decimals = await getTokenDecimalsFromCoingecko(coinId, platformId);

    return {
      decimals,
      symbol: onchainInfo.symbol,
      token2022: onchainInfo.token2022
    };

  } catch (error) {
    try {
      const decimals = await getTokenDecimalsFromCoingecko(coinId, platformId);
      return {
        decimals,
        symbol: undefined,
        token2022: undefined
      };
    } catch (_coingeckoError) {
      throw error; // Re-throw original error if fallback fails
    }
  }
};

const log = {
  info: (msg: string) => console.log('\x1b[36m%s\x1b[0m', msg),
  success: (msg: string) => console.log('\x1b[32m%s\x1b[0m', msg),
  warning: (msg: string) => console.log('\x1b[33m%s\x1b[0m', msg),
  error: (msg: string) => console.log('\x1b[31m%s\x1b[0m', msg),
};

// Pretty-printed to match the committed data/v1/*.json layout (indent=2, no trailing newline).
// Write to a sibling .tmp then rename so a crash cannot leave a truncated destination.
const writeUniverseJson = async (filePath: string, data: Result): Promise<void> => {
  const tmpPath = `${filePath}.tmp`;
  try {
    await fs.promises.writeFile(
      tmpPath,
      JSON.stringify(sortTokenListJson(data), null, 2),
    );
    await fs.promises.rename(tmpPath, filePath);
  } catch (error) {
    await fs.promises.unlink(tmpPath).catch(() => undefined);
    throw error;
  }
};

const main = async (maxRank: number | undefined = undefined) => {
  const result: Result = {};
  // topN.json is the universe as of the last coin with rank <= maxRank. Clone lazily
  // when we first mutate `result` after leaving that window so we don't stringify
  // the growing list on every coin.
  let topNSnapshot: Result | undefined;
  let resultIsCurrentTopN = false;
  let shouldWriteUniverse = false;

  log.info('⛓️ Fetching asset platforms from CoinGecko...');
  const platforms = await coingecko.getAssetPlatforms();
  log.success(`    └─→ Found ${platforms.length} platforms`);

  log.info('🪙 Fetching coin list from CoinGecko...');
  const coins = await coingecko.getCoinsList();
  log.success(`    └─→ Found ${coins.length} coins`);

  log.info('📈 Stream coin market data...');
  log.success(`    └─→ ${maxRank ? `Max rank: ${maxRank}` : 'No max rank'}`);

  for await (const market of coingecko.streamCoinMarkets()) {
    let addedTokens = 0;
    const logs: string[] = [];
    const inTopN = Boolean(maxRank && market.market_cap_rank && market.market_cap_rank <= maxRank);

    const coin = coins.find(c => c.id === market.id);
    if (!coin) continue;

    // Collect all platform requests to parallelize
    type PlatformRequest = {
      platformId: string;
      address: string;
      chainId: ChainId;
      resolvedAddress: string;
    };

    const platformRequests: PlatformRequest[] = [];

    for (const [platformId, address] of Object.entries(coin.platforms)) {
      const platform = platforms.find(p => p.id === platformId);
      if (!platform) {
        continue;
      }

      const chainId = getPlatformChainId(platform);
      if (!chainId) {
        continue;
      }

      let evmAddress: string | undefined;
      if (chainId === ChainId.NEAR_PROTOCOL_EVM) {
        evmAddress = nearToEvmAddress(address);
      }

      // Polkadot Asset Hub assets are identified by integer asset IDs
      // (e.g. "1337" for USDC), never contract addresses. CoinGecko occasionally
      // mistags EVM addresses under the polkadot platform, so skip anything
      // that isn't a numeric asset id.
      if (chainId === ChainId.POLKADOT && !/^\d+$/.test(address)) {
        continue;
      }

      if (isEVMAddress(address)) {
        evmAddress = address;
      }

      // Skip if token or platform is not supported
      if (!evmAddress && !["solana", "cardano", "polkadot"].includes(platformId)) {
        continue;
      }

      const resolvedAddress = evmAddress || address;

      if (isBlacklisted(chainId, resolvedAddress)) {
        continue;
      }

      platformRequests.push({ platformId, address, chainId, resolvedAddress });
    }

    // Fetch all platform data in parallel
    const tokenInfoPromises = platformRequests.map(req =>
      getTokenInfo(req.chainId, req.resolvedAddress, coin.id, req.platformId)
        .then(tokenInfo => ({ ...req, tokenInfo, success: true as const }))
        .catch((error: Error) => ({ ...req, error, success: false as const }))
    );

    const results = await Promise.all(tokenInfoPromises);

    for (const item of results) {
      if (!item.success) {
        logs.push(`⚠️ [skip] ${coin.symbol} (${item.resolvedAddress}) on ${item.chainId}`);
        logs.push(`    └─→ ${item.error?.message || 'Unknown error'}`);
        continue;
      }

      const { decimals, symbol, token2022 } = item.tokenInfo;

      if (decimals === undefined) {
        logs.push(`⚠️ [skip] ${coin.symbol} (${item.resolvedAddress}) on ${item.chainId}`);
        logs.push(`    └─→ No decimals found`);
        continue;
      }

      if (resultIsCurrentTopN && !inTopN) {
        topNSnapshot = structuredClone(result);
        resultIsCurrentTopN = false;
      }

      result[item.chainId] ??= {};
      result[item.chainId][item.resolvedAddress] = {
        name: coin.name,
        // Coingecko returns lowercase symbols; uppercase to match onchain convention.
        symbol: symbol || coin.symbol.toUpperCase(),
        coingeckoId: coin.id,
        decimals,
        logo: market.image,
      };

      if (token2022) {
        result[item.chainId][item.resolvedAddress].token2022 = token2022;
      }

      addedTokens++;
      if (item.resolvedAddress !== item.address) {
        logs.push(`💎 [add]  ${coin.symbol} (${item.address} -> ${item.resolvedAddress}) on ${item.chainId}`);
      } else {
        logs.push(`💎 [add]  ${coin.symbol} (${item.resolvedAddress}) on ${item.chainId}`);
      }
    }

    if (addedTokens > 0 || logs.length > 0) {
      const boxWidth = 78;
      const border = '─'.repeat(boxWidth);
      console.log(`┌${border}┐`);

      logs.forEach(msg => {
        console.log(`│ ${msg.padEnd(boxWidth - 2)} │`);
      });

      console.log(`├${border}┤`);
      const summary = `✅ Processed ${addedTokens} token(s) for ${coin.name} (${coin.symbol})`;
      console.log(`│ ${summary.padEnd(boxWidth - 3)} │`);
      console.log(`└${border}┘`);

      shouldWriteUniverse = true;
      if (inTopN) {
        resultIsCurrentTopN = true;
        topNSnapshot = undefined;
      }
    }
  }

  if (shouldWriteUniverse) {
    log.info('💾 Writing universe JSON...');
    // Full universe first so a later top-N write failure still leaves coingecko.json updated.
    await writeUniverseJson('data/v1/coingecko.json', result);
    if (maxRank && (resultIsCurrentTopN || topNSnapshot)) {
      await writeUniverseJson(
        `data/v1/coingecko-top${maxRank}.json`,
        topNSnapshot ?? result,
      );
    }
  }
};

main(5000)
  .then(() => {
    log.success('✨ Generation complete!');
    process.exit(0);
  })
  .catch((error) => {
    log.error(`❌ Error: ${error.message}`);
    process.exit(1);
  });
