const fetch = require('node-fetch')
const trustedCoingeckoIdsByChainId = require('../data/solana/trusted-coingecko-ids.json')

const installErrorHandlers = () => {
  process.on('uncaughtException', (err) => {
    console.error(err.stack)
    process.exit(1)
  })

  process.on('unhandledRejection', (err) => {
    console.error('Unhandled rejection:', err)
    process.exit(1)
  })
}

const generateMainnetTokenList = async (fullTokenList) => {
  const MAX_TOKEN_LIST_SIZE = 100
  const coinGeckoApiBaseUrl = 'https://api.coingecko.com/api/v3'

  // Fetch the list of tokens from CoinGecko
  const coinListEndpoint =
    coinGeckoApiBaseUrl + '/coins/list?include_platform=true'
  const coinListResponse = await fetch(coinListEndpoint)
  if (!coinListResponse.ok) {
    throw new Error(
      `Error fetching coin list from CoinGecko: ${coinListResponse.status} ${coinListResponse.statusText}`
    )
  }
  const coinList = await coinListResponse.json()
  // Ex.
  // [
  //   {
  //     "id": "01coin",
  //     "symbol": "zoc",
  //     "name": "01coin",
  //     "platforms": {}
  //   },
  //   {
  //     "id": "0chain",
  //     "symbol": "zcn",
  //     "name": "Zus",
  //     "platforms": {
  //       "ethereum": "0xb9ef770b6a5e12e45983c5d80545258aa38f3b78",
  //       "polygon-pos": "0x8bb30e0e67b11b978a5040144c410e1ccddcba30"
  //     }
  //   },

  // Mapping from Coingecko IDs to Ethereum token contract addresses
  const contractAddresses = {}
  for (const coin of coinList) {
    if (coin.platforms && coin.platforms.ethereum) {
      contractAddresses[coin.id] = coin.platforms.ethereum
    }
  }

  // Fetch the top 250 tokens by market cap from CoinGecko
  const coinMarketEndpoint =
    coinGeckoApiBaseUrl +
    '/coins/markets?vs_currency=usd&category=ethereum-ecosystem&order=market_cap_desc&per_page=250&page=1&sparkline=false'
  const coinMarketResponse = await fetch(coinMarketEndpoint)
  if (!coinMarketResponse.ok) {
    throw new Error(
      `Error fetching coin market data: ${coinMarketResponse.status} ${coinMarketResponse.statusText}`
    )
  }
  const topCoins = await coinMarketResponse.json()
  // Ex.
  // [
  //   {
  //     "id": "ethereum",
  //     "symbol": "eth",
  //     "name": "Ethereum",
  //     "image": "https://assets.coingecko.com/coins/images/279/large/ethereum.png?1595348880",
  //     "current_price": 1647.39,
  //     "market_cap": 198265811337,
  //     "market_cap_rank": 2,
  //     "fully_diluted_valuation": 198265811337,
  //     "total_volume": 9138271993,
  //     "high_24h": 1690.44,
  //     "low_24h": 1635.13,
  //     "price_change_24h": -22.227143657222314,
  //     "price_change_percentage_24h": -1.33127,
  //     "market_cap_change_24h": -2275221284.88501,
  //     "market_cap_change_percentage_24h": -1.13454,
  //     "circulating_supply": 120508854.572098,
  //     "total_supply": 120508854.572098,
  //     "max_supply": null,
  //     "ath": 4878.26,
  //     "ath_change_percentage": -66.26464,
  //     "ath_date": "2021-11-10T14:24:19.604Z",
  //     "atl": 0.432979,
  //     "atl_change_percentage": 379987.53669,
  //     "atl_date": "2015-10-20T00:00:00.000Z",
  //     "roi": {
  //       "times": 95.17701531300291,
  //       "currency": "btc",
  //       "percentage": 9517.701531300292
  //     },
  //     "last_updated": "2023-02-08T21:05:06.901Z"
  //   },
  //   ...
  // ]

  // Map lowercase token contract addresses to checksum addresses
  // Needed because the token list uses checksum addresses, but the CoinGecko API returns lowercase addresses
  const checksumAddresses = {}
  for (const [key] of Object.entries(fullTokenList)) {
    checksumAddresses[key.toLowerCase()] = key
  }

  // For each of the top 250 tokens, check (1) if there is a corresponding ethereum token contract address
  // by checkingif the id is in the contractAddresses, and (2) if the token contract address is in
  // the tokenList. If both conditions are true, then add the token to the output token list. Continue
  // until we have 100 tokens in the output token list.
  const outputTokenList = {}
  for (const coin of topCoins) {
    const contractAddress = contractAddresses[coin.id]
    if (contractAddress) {
      const checksumAddress = checksumAddresses[contractAddress.toLowerCase()]
      if (checksumAddress && fullTokenList[checksumAddress]) {
        outputTokenList[checksumAddress] = fullTokenList[checksumAddress]
        if (Object.keys(outputTokenList).length === MAX_TOKEN_LIST_SIZE) {
          break
        }
      }
    }
  }

  // Ensure BAT is always added
  outputTokenList['0x0D8775F648430679A709E98d2b0Cb6250d2887EF'] = {
    name: 'Basic Attention Token',
    logo: 'bat.png',
    erc20: true,
    symbol: 'BAT',
    decimals: 18
  }

  return Object.keys(outputTokenList).reduce((acc, contractAddress) => {
    acc[contractAddress] = {
      ...outputTokenList[contractAddress],
      chainId: '0x1'
    }
    return acc
  }, {})
}

const generateDappListsForChain = async (chain) => {
  const metric = 'uaw'
  const range = '30d'

  for (const top of [100, 50, 25, 10]) {
    const url = `https://apis.dappradar.com/v2/dapps/top/${metric}?chain=${chain}&range=${range}&top=${top}`
    const response = await fetch(url, {
      headers: {
        'X-API-KEY': process.env.DAPP_RADAR_API_KEY
      }
    })

    if (!response.ok) {
      console.error(
        `Error: [chain=${chain} top=${top}] ${response.status} ${response.statusText}`
      )
      continue
    }

    const dapps = await response.json()

    // Remove socialLinks and fullDescription from each dApp object
    dapps.results = dapps.results.map((dapp) => {
      const { socialLinks, fullDescription, logo, ...filteredDapp } = dapp
      const logoUrl = new URL(logo)
      logoUrl.hostname = 'dashboard-assets-dappradar.wallet.brave.com'
      filteredDapp.logo = logoUrl.toString()
      return filteredDapp
    })

    return dapps
  }

  throw new Error(`Error fetching dApps for ${chain}`)
}

const generateDappLists = async () => {
  const chains = [
    'solana',
    'ethereum',
    'polygon',
    'bnb-chain',
    'optimism',
    'aurora',
    'avalanche',
    'fantom'
  ]
  const dappLists = {}
  for (let chain of chains) {
    const dapps = await generateDappListsForChain(chain)
    // Replace 'bnb-chain' with 'binance_smart_chain' so it plays well
    // with the browser JSON parser.
    if (chain === 'bnb-chain') {
      chain = 'binance_smart_chain'
    }

    dappLists[chain] = dapps
  }

  return dappLists
}

const addSupportedCoinbaseTokens = async (rampTokens) => {
  // Public Coinbase API url
  const coinbaseApiUrl = 'https://api.exchange.coinbase.com/currencies'

  // Maps Coinbase's network IDs to our hex chain IDs
  const networkIdMap = {
    ethereum: '0x1',
    kava: '0x8ae',
    solana: '0x65',
    arbitrum: '0xa4b1',
    optimism: '0xa',
    ethereumclassic: '0x3d',
    avacchain: '0xa86a',
    polygon: '0x89',
    celo: '0xa4ec'
  }

  const response = await fetch(coinbaseApiUrl)
  const coinbaseTokens = await response.json()

  // Convert array to a map for efficient lookup using compound key
  const tokenMap = new Map(
    rampTokens.tokens.map((token) => [
      `${token.chain_id}-${token.contract_address?.toLowerCase()}`,
      token
    ])
  )

  for (const currency of coinbaseTokens) {
    // Skip the token if the name or symbol are missing
    if (currency.name === null || currency.id === null) {
      continue
    }

    for (const network of currency.supported_networks) {
      const networkHexId = networkIdMap[network.id]
      if (!networkHexId) {
        continue
      }

      const correspondingToken = tokenMap.get(
        `${networkHexId}-${network.contract_address?.toLowerCase()}`
      )

      if (correspondingToken) {
        if (!correspondingToken.on_ramp_providers.includes('coinbase')) {
          correspondingToken.on_ramp_providers.push('coinbase')
        }
      } else {
        const newToken = {
          contract_address: network.contract_address || '', // Empty string allowed for native tokens.
          name: currency.name,
          logo: '',
          is_erc20: network.contract_address !== null,
          is_erc721: false,
          is_erc1155: false,
          is_nft: false,
          symbol: currency.id,
          decimals: 18, // Adding decimals since it's required by the parser, but it's not used for on ramp tokens.
          visible: true,
          token_id: '',
          coingecko_id: '',
          chain_id: networkHexId,
          coin: network.id === 'solana' ? 501 : 60,
          on_ramp_providers: ['coinbase'],
          off_ramp_providers: []
        }
        tokenMap.set(
          `${networkHexId}-${network.contract_address?.toLowerCase()}`,
          newToken
        )
      }
    }
  }

  // Convert back to array format for return
  rampTokens.tokens = Array.from(tokenMap.values())

  return rampTokens
}

const addSupportedSardineCurrencies = async (onRampCurrencies) => {
  const sardine = 'sardine'
  const sardineApiUrl = 'https://api.sandbox.sardine.ai/v1/geo-coverage'
  const response = await fetch(sardineApiUrl)
  const jsonResponse = await response.json()
  const currencyCodes = []

  for (const country of jsonResponse.data) {
    if (country.isAllowedOnRamp) {
      if (!currencyCodes.includes(country.currencyCode)) {
        currencyCodes.push(country.currencyCode)
      }
    }
  }

  // Create a dictionary for quick lookups
  const currencyLookup = {}
  onRampCurrencies.currencies.forEach((currency) => {
    currencyLookup[currency.currency_code] = currency
  })

  for (const currencyCode of currencyCodes) {
    const existingCurrency = currencyLookup[currencyCode]

    if (existingCurrency) {
      // If "sardine" isn't already in the providers array, add it
      if (!existingCurrency.providers.includes(sardine)) {
        existingCurrency.providers.push(sardine)
      }
    } else {
      // If the currency doesn't exist, create a new entry
      const newCurrency = {
        currency_code: currencyCode,
        currency_name: '',
        providers: [sardine]
      }
      onRampCurrencies.currencies.push(newCurrency)
      currencyLookup[currencyCode] = newCurrency
    }
  }

  return onRampCurrencies
}

const generateChainList = async () => {
  const chainListResponse = await fetch('https://chainid.network/chains.json')
  if (!chainListResponse.ok) {
    throw new Error(
      `Error fetching chain list from chainid.network:
      ${chainListResponse.status} ${chainListResponse.statusText}`
    )
  }

  return await chainListResponse.json()
}

const generateCoingeckoIds = async () => {
  const coinGeckoApiBaseUrl = 'https://api.coingecko.com/api/v3'

  // Fetch the list of tokens from CoinGecko
  const coinListResponse = await fetch(
    `${coinGeckoApiBaseUrl}/coins/list?include_platform=true`
  )
  if (!coinListResponse.ok) {
    throw new Error(
      `Error fetching coin list from CoinGecko:
      ${coinListResponse.status} ${coinListResponse.statusText}`
    )
  }
  const coinList = await coinListResponse.json()

  const assetPlatformsResponse = await fetch(
    `${coinGeckoApiBaseUrl}/asset_platforms`
  )
  if (!assetPlatformsResponse.ok) {
    throw new Error(
      `Error fetching asset platforms from CoinGecko:
      ${assetPlatformsResponse.status} ${assetPlatformsResponse.statusText}`
    )
  }
  const assetPlatformsList = await assetPlatformsResponse.json()
  const assetPlatformsMap = assetPlatformsList.reduce((acc, platform) => {
    // Manually add Solana chain identifier since it's not in the CoinGecko
    // asset platforms list
    if (platform.id === 'solana' && !platform.chain_identifier) {
      platform.chain_identifier = 101
    }

    acc[platform.id] = platform.chain_identifier
    return acc
  }, {})

  const coingeckoIdsByChainId = coinList.reduce((acc, coin) => {
    Object.entries(coin.platforms).forEach(([platform, contractAddress]) => {
      const chainId = assetPlatformsMap[platform]
      if (!chainId || !contractAddress) {
        return
      }

      const chainIdHex = `0x${chainId.toString(16)}`
      if (acc[chainIdHex]) {
        acc[chainIdHex][contractAddress] = coin.id
      } else {
        acc[chainIdHex] = {
          [contractAddress]: coin.id
        }
      }
    })

    return acc
  }, {})

  return Object.fromEntries(
    Object.keys(coingeckoIdsByChainId).map((chainId) => [
      chainId,
      {
        ...coingeckoIdsByChainId[chainId],
        ...trustedCoingeckoIdsByChainId[chainId]
      }
    ])
  )
}

const fetchGitHubFileContent = async (
  repoOwner,
  repoName,
  branch,
  filePath,
  githubHeaders
) => {
  const contentApiUrl = `https://api.github.com/repos/${repoOwner}/${repoName}/contents/${filePath}?ref=${branch}`

  const contentResponse = await fetch(contentApiUrl, {
    headers: githubHeaders
  })
  const contentData = await contentResponse.json()

  if (!contentData.content) {
    console.error(
      'Failed to fetch content for file:',
      filePath,
      contentData.message || 'Unknown error'
    )
    return ''
  }

  return Buffer.from(contentData.content, 'base64').toString('utf-8')
}

const fetchGitHubRepoTopLevelFiles = async (repoOwner, repoName, branch) => {
  const githubToken = process.env.API_AUTH_TOKEN_GITHUB
  const githubHeaders = {
    Accept: 'application/vnd.github.v3+json',
    Authorization: `token ${githubToken}`
  }

  const apiUrl = `https://api.github.com/repos/${repoOwner}/${repoName}/git/trees/${branch}?recursive=1`
  const response = await fetch(apiUrl, { headers: githubHeaders })
  const data = await response.json()

  if (!data.tree) {
    console.error('Failed to fetch files:', data.message)
    return
  }

  const jsonFiles = []
  for (const item of data.tree) {
    if (
      item.type === 'blob' &&
      !item.path.includes('/') &&
      item.path.endsWith('.json') &&
      item.path !== 'README.md'
    ) {
      jsonFiles.push(item)
    }
  }

  let bannedAddresses = []
  for (const file of jsonFiles) {
    const content = await fetchGitHubFileContent(
      repoOwner,
      repoName,
      branch,
      file.path,
      githubHeaders
    )
    const bannedAddressesForFile = JSON.parse(content)
    bannedAddresses = [...bannedAddressesForFile, ...bannedAddresses]
  }
  bannedAddresses = [...new Set(bannedAddresses)]

  return { addresses: bannedAddresses }
}

/**
 * Sorts a token list JSON object by chain IDs and contract addresses while preserving
 * the order of token metadata properties (name, symbol, coingeckoId, decimals, logo, etc.)
 */
const sortTokenListJson = (tokenListJson) => {
  return Object.keys(tokenListJson)
    .sort()
    .reduce((result, chainId) => {
      const chainTokens = tokenListJson[chainId]
      result[chainId] = Object.keys(chainTokens)
        .sort()
        .reduce((sortedTokens, address) => {
          sortedTokens[address] = chainTokens[address]
          return sortedTokens
        }, {})
      return result
    }, {})
}

module.exports = {
  installErrorHandlers,
  generateMainnetTokenList,
  generateDappLists,
  addSupportedCoinbaseTokens,
  addSupportedSardineCurrencies,
  generateCoingeckoIds,
  generateChainList,
  fetchGitHubRepoTopLevelFiles,
  sortTokenListJson
}
