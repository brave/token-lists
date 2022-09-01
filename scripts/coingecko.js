// node-fetch is ESM-only module. Use async import() instead of require().
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args))

const CoinType = {
  ETH: 60,
  FIL: 461,
  SOL: 501
}

const assetPlatformRegistry = {
  [CoinType.ETH]: {
    '0x1': 'ethereum',
    '0x89': 'polygon-pos',
    '0x38': 'binance-smart-chain',
    '0xa86a': 'avalanche',
    '0xfa': 'fantom',
    '0xa4ec': 'celo',
    '0xa': 'optimistic-ethereum',
    '0x4e454152': 'aurora'
  },
  [CoinType.SOL]: {
    '0x65': 'solana'
  }
}

const getCoingeckoId = (contractAddress, chainId, coinType) => {
  const assetPlatform = (assetPlatformRegistry[coinType] || {})[chainId]

  return new Promise((resolve, reject) => {
    if (!assetPlatform) {
      reject(`Unknown asset platform for chain id: ${chainId}`)
    } else {
      const contract = contractAddress.toLowerCase()
      fetch(
        `https://api.coingecko.com/api/v3/coins/${assetPlatform}/contract/${contract}`
      )
        .then(response => response.json())
        .then((data)  => {
          if (data.id) {
            resolve(data.id)
          } else {
            reject(`Failed to find coingeckoId: platform=${assetPlatform} contract=${contract} error=${data.error}`)
          }
        })
        .catch(e => reject(e))
    }
  })
}

module.exports = {
  getCoingeckoId,
  CoinType
}
