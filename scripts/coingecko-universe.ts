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
 *      }
 *    }
 *
 * Contract and program addresses are case-sensitive and encoded in their
 * respective canonical forms:
 *   - Ethereum addresses follow EIP-55 checksum encoding
 *   - Solana addresses use their base58 representation
 */
import util from 'node:util';
import fs from 'node:fs';

import { ethers } from 'ethers';
import * as solanaWeb3 from '@solana/web3.js';
import * as splToken from '@solana/spl-token';

import coingecko, { AssetPlatform } from './lib/coingecko';

// Enable colors in util.inspect
util.inspect.defaultOptions.colors = true;

type TokenInfo = {
  name: string;
  symbol: string;
  coingeckoId: string;
  decimals: number;
  logo: string;
};
type Result = Record<string, Record<string, TokenInfo>>;

// The enum fields indicate the chain IDs that we support.
//
// The current criteria for inclusion is as follows:
//   - The chain must be top 10 by TVL on DefiLlama
//   - The chain must have native USDC token
enum ChainId {
  ETHEREUM = '0x1',
  BSC = '0x38', 
  ARBITRUM = '0xa4b1',
  BASE = '0x2105',
  POLYGON = '0x89',
  OPTIMISM = '0xa',
  AVALANCHE = '0xa86a',
  SOLANA = '0x65',

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

    // Disabled for now
    // [ChainId.ZKSYNC]: process.env.ZKSYNC_RPC_URL!,
  } as const;
}

const rpcConfig = loadRpcConfig();

const getPlatformChainId = (platform: AssetPlatform): ChainId | undefined => {
  // Special case for Solana since it doesn't use chain identifiers
  if (platform.id === "solana") {
    return ChainId.SOLANA;
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

const getDecimals = async (chainId: ChainId, address: string) => {
  const rpcUrl = rpcConfig[chainId];

  if (chainId === ChainId.SOLANA) {
    const connection = new solanaWeb3.Connection(rpcUrl);
    const mintPubkey = new solanaWeb3.PublicKey(address);

    try {
      // First try standard SPL Token program
      const mintInfo = await splToken.getMint(
        connection, 
        mintPubkey,
        undefined, // commitment
        splToken.TOKEN_PROGRAM_ID
      );
      return mintInfo.decimals;
    } catch (error) {
      // If standard SPL Token fails, try Token-2022 program
      const mintInfo = await splToken.getMint(
        connection, 
        mintPubkey,
        undefined, // commitment
        splToken.TOKEN_2022_PROGRAM_ID
      );
      return mintInfo.decimals;
    }
  }

  const provider = new ethers.JsonRpcProvider(rpcUrl)
  const contract = new ethers.Contract(
    address,
    ['function decimals() view returns (uint8)'],
    provider,
  )

  return Number(await contract.decimals())
}

const log = {
  info: (msg: string) => console.log('\x1b[36m%s\x1b[0m', msg),
  success: (msg: string) => console.log('\x1b[32m%s\x1b[0m', msg),
  warning: (msg: string) => console.log('\x1b[33m%s\x1b[0m', msg),
  error: (msg: string) => console.log('\x1b[31m%s\x1b[0m', msg),
};

const main = async (maxRank: number | undefined = undefined) => {
  const result: Result = {};
  
  log.info('⛓️ Fetching asset platforms from CoinGecko...');
  const platforms = await coingecko.getAssetPlatforms();
  log.success(`    └─→ Found ${platforms.length} platforms`);

  log.info('🪙 Fetching coin list from CoinGecko...');
  const coins = await coingecko.getCoinsList();
  log.success(`    └─→ Found ${coins.length} coins`);

  log.info('📈 Stream coin market data...');
  log.success(`    └─→ ${maxRank ? `Max rank: ${maxRank}` : 'No max rank'}`);

  for await (const market of coingecko.streamCoinMarkets()) {
    let processed = false;
    let addedTokens = 0;
    let logs: string[] = [];

    const coin = coins.find(c => c.id === market.id);
    if (!coin) continue;

    for (const [platformId, address] of Object.entries(coin.platforms)) {
      if (!isEVMAddress(address) && platformId !== "solana") {
        continue;
      }

      const platform = platforms.find(p => p.id === platformId);
      if (!platform) {
        continue;
      }

      const chainId = getPlatformChainId(platform);
      if (!chainId) {
        continue;
      }

      let decimals: number;
      try {
        decimals = await getDecimals(chainId, address);
      } catch (error: any) {
        logs.push(`⚠️ [skip] ${coin.symbol} (${address}) on ${chainId}`);
        logs.push(`    └─→ ${error?.message || 'Unknown error'}`);
        continue;
      }

      result[chainId] ??= {};
      result[chainId][address] = {
        name: coin.name,
        symbol: coin.symbol,
        coingeckoId: coin.id,
        decimals,
        logo: market.image,
      };
      processed = true;
      addedTokens++;
      logs.push(`💎 [add]  ${coin.symbol} (${address}) on ${chainId}`);
    }

    if (processed || logs.length > 0) {
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

      if (maxRank && market.market_cap_rank && market.market_cap_rank <= maxRank) {
        await fs.promises.writeFile(
          `data/v1/coingecko-top${maxRank}.json`,
          JSON.stringify(result, null, 2)
        );
      }

      await fs.promises.writeFile(
        'data/v1/coingecko.json',
        JSON.stringify(result, null, 2)
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
