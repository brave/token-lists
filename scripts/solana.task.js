import path from 'path'
import fs from 'fs'

import {
  Generator,
  ProviderCoinGecko,
  ProviderTrusted,
  ProviderIgnore,
  ChainId,
  Tag,
} from '@solflare-wallet/utl-aggregator'

const sec = 1000

async function generateTokensList() {
  const trustedTokenList =
    process.env.TRUSTED_TOKEN_LIST_URL ??
    'https://cdn.jsdelivr.net/gh/brave/token-lists@main/data/solana/trusted-tokenlist.json'
  const coinGeckoApiKey = process.env.COINGECKO_API_KEY ?? null
  const rpcUrlMainnet = process.env.SOLANA_MAINNET_RPC_URL

  const generator = new Generator(
    [
      ...(trustedTokenList
        ? [
            new ProviderTrusted(
              trustedTokenList,
              [Tag.LP_TOKEN],
              ChainId.MAINNET
            ),
          ]
        : []),
      new ProviderCoinGecko(coinGeckoApiKey, rpcUrlMainnet, {
        throttle: 200,
        throttleCoinGecko: 65 * sec,
        batchAccountsInfo: 200,
        batchCoinGecko: 5,
      }),
    ],
    [
      new ProviderIgnore(
        'https://raw.githubusercontent.com/solflare-wallet/token-list/master/ignore-tokenlist.json',
        [],
        ChainId.MAINNET
      ),
    ]
  )

  const tokenMap = await generator.generateTokenList()
  fs.writeFileSync(
    path.join('data', 'solana', 'tokenlist.json'),
    JSON.stringify(tokenMap, null, 2)
  )
  return tokenMap
}

await generateTokensList()
