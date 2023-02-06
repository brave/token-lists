import path from 'path'
import fs from 'fs'
import fsPromises from 'fs/promises'

import {
  ChainId,
  Generator,
  ProviderCoinGecko,
  ProviderTrusted
} from '@solflare-wallet/utl-aggregator'

async function generateTokensList () {
  const trustedTokenList =
    process.env.TRUSTED_TOKEN_LIST_URL ??
    'https://cdn.jsdelivr.net/gh/brave/token-lists@main/data/solana/trusted-tokenlist.json'
  const coinGeckoApiKey = process.env.COINGECKO_API_KEY ?? null
  const rpcUrlMainnet = process.env.SOLANA_MAINNET_RPC_URL

  const generator = new Generator([
    ...(trustedTokenList ? [new ProviderTrusted(trustedTokenList, [], ChainId.MAINNET)] : []),
    new ProviderCoinGecko(coinGeckoApiKey, rpcUrlMainnet, {
      throttle: 200,
      throttleCoinGecko: 65 * 1000,
      batchAccountsInfo: 200,
      batchCoinGecko: 5
    })
  ])

  const tokenMap = await generator.generateTokenList()
  fs.writeFileSync(path.join('data', 'solana', 'tokenlist.json'), JSON.stringify(tokenMap, null, 2))
  return tokenMap
}

await generateTokensList()
