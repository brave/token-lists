const childProcess = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')
const sharp = require('sharp')
const Downloader = require('nodejs-file-downloader')
const fetch = require('node-fetch')

const contractReplaceSvgToPng = (file) => {
  const data = JSON.parse(fs.readFileSync(file))
  for (const p in data) {
    if (data.hasOwnProperty(p)) {
      if (!data[p].logo) {
        continue
      }
      data[p].logo = data[p].logo.substr(0, data[p].logo.lastIndexOf(".")) + ".png"
    }
  }
  fs.writeFileSync(file, JSON.stringify(data, null, 2))
}

const contractAddExtraMainnetAssets = (tokensListMap) => {
  return {
    ...tokensListMap,
    // CRV
    "0xD533a949740bb3306d119CC777fa900bA034cd52": {
      name: "Curve",
      logo: "curve.png",
      erc20: true,
      symbol: "CRV",
      decimals: 18,
      chainId: "0x1"
    },

    // EURT
    "0xc581b735a1688071a1746c968e0798d642ede491": {
      name: "Euro Tether",
      logo: "eurt.png",
      erc20: true,
      symbol: "EURT",
      decimals: 6,
      chainId: "0x1"
    },

    // TAMA
    "0x12b6893ce26ea6341919fe289212ef77e51688c8": {
      name: "Tamagode",
      logo: "tama.png",
      erc20: true,
      symbol: "TAMA",
      decimals: 18,
      chainId: "0x1"
    },

    // VRA
    "0xf411903cbc70a74d22900a5de66a2dda66507255": {
      name: "Verasity",
      logo: "vra.png",
      erc20: true,
      symbol: "VRA",
      decimals: 18,
      chainId: "0x1"
    },

    // MASK
    "0x69af81e73a73b40adf4f3d4223cd9b1ece623074": {
      name: "Mask Network",
      logo: "mask.png",
      erc20: true,
      symbol: "MASK",
      decimals: 18,
      chainId: "0x1"
    },

    // CTSI
    "0x491604c0fdf08347dd1fa4ee062a822a5dd06b5d": {
      name: "Cartesi",
      logo: "ctsi.png",
      erc20: true,
      symbol: "CTSI",
      decimals: 18,
      chainId: "0x1"
    },

    // DAO
    "0x0f51bb10119727a7e5ea3538074fb341f56b09ad": {
      name: "DAO Maker",
      logo: "dao.png",
      erc20: true,
      symbol: "DAO",
      decimals: 18,
      chainId: "0x1"
    },

    // CLV
    "0x80C62FE4487E1351b47Ba49809EBD60ED085bf52": {
      name: "Clover Finance",
      logo: "clv.png",
      erc20: true,
      symbol: "CLV",
      decimals: 18,
      chainId: "0x1"
    },

    // AGEUR
    "0x1a7e4e63778b4f12a199c062f3efdd288afcbce8": {
      name: "agEUR",
      logo: "ageur.png",
      erc20: true,
      symbol: "AGEUR",
      decimals: 18,
      chainId: "0x1"
    },

    // SWAP
    "0xcc4304a31d09258b0029ea7fe63d032f52e44efe": {
      name: "TrustSwap",
      logo: "swap.png",
      erc20: true,
      symbol: "SWAP",
      decimals: 18,
      chainId: "0x1"
    },

    // YLD
    "0xf94b5c5651c888d928439ab6514b93944eee6f48": {
      name: "YIELD App",
      logo: "yld.png",
      erc20: true,
      symbol: "YLD",
      decimals: 18,
      chainId: "0x1"
    },

    // GTH
    "0xeb986DA994E4a118d5956b02d8b7c3C7CE373674": {
      name: "Gather",
      logo: "gth.png",
      erc20: true,
      symbol: "GTH",
      decimals: 18,
      chainId: "0x1"
    },

    // QUARTZ
    "0xba8a621b4a54e61c442f5ec623687e2a942225ef": {
      name: "Sandclock",
      logo: "quartz.png",
      erc20: true,
      symbol: "QUARTZ",
      decimals: 18,
      chainId: "0x1"
    }
  }
}

async function saveToPNGResize(source, dest, ignoreError) {
  return new Promise(function (resolve, reject) {
    sharp(source)
      .png()
      .toFile(dest)
      .then(function (info) {
        if (info.width > 200 || info.height > 200) {
          let aspectRatio = 200 / info.width
          if (info.height > info.width) {
            aspectRatio = 200 / info.height
          }
          const newWidth = Math.round(info.width * aspectRatio)
          const newHeight = Math.round(info.height * aspectRatio)
          sharp(source)
            .png()
            .resize(newWidth, newHeight)
            .toFile(dest)
            .then(function (info) {
              resolve()
            })
            .catch(function (err) {
              console.log('source == ' + source + ' ' + err)
              reject()
            })
        } else {
          if ((info.width < 200 || info.height < 200) && !source.endsWith(".png")) {
            console.log('resizing vector image == ' + source)
            const outputDir = path.join(os.tmpdir(), 'brave-token-images')
            console.log('outputdir: ', outputDir)
            if (!fs.existsSync(outputDir)) {
              fs.mkdirSync(outputDir)
            }
            const fileName = path.parse(source).base
            let cmd = './node_modules/svg-resizer/svg-resizer.js'
            let args = ['-f', '-x', '300', '-y', '300', '-o', outputDir, '-i', source]
            childProcess.execFileSync(cmd, args)
            saveToPNGResize(path.join(outputDir, fileName), dest, true)
              .then(resolve)
              .catch((e) => console.log(e))
          } else {
            resolve()
          }
        }
      })
      .catch(function (err) {
        if (ignoreError) {
          console.log('source == ' + source + ' ' + err)
          console.log('Do you need to "brew install librsvg"?')
          reject()
          return
        }
        console.log('trying one more time source == ' + source + ' ' + err)
        const outputDir = path.join(os.tmpdir(), 'brave-token-images')
        if (!fs.existsSync(outputDir)) {
          fs.mkdirSync(outputDir)
        }
        const fileName = path.parse(source).base
        fs.copyFileSync(source, path.join(outputDir, fileName))
        try {
          modifySvgFile(path.join(outputDir, fileName))
        } catch (e) {
          console.log('failed to fix SVG file:', e)
          return
        }

        saveToPNGResize(path.join(outputDir, fileName), dest, true)
          .then(resolve)
          .catch((e) => {
            console.log(e)
            reject()
          })
      })
  })
}

const modifySvgFile = (file) => {
  const buf = '<?xml version="1.0" encoding="utf8"?>'
  const bufToReplace = '<?xml version="1.0" encoding="windows-1252"?>'
  let data = fs.readFileSync(file).toString()
  if (data.startsWith(bufToReplace)) {
    data = buf + data.substring(bufToReplace.length)
  } else {
    data = buf + data
  }
  fs.writeFileSync(file, data)
}

async function download(url, dest) {
  console.log(`download: ${url}`)
  const downloader = new Downloader({
    url,
    directory: os.tmpdir(),
    headers: {
      'User-Agent': 'Chrome/91.0.0'
    },
    onBeforeSave: (deducedName) => {
      const deducedExtension = path.extname(deducedName)
      return path.parse(dest).name + deducedExtension
    },
    cloneFiles: false,

    // We set it to 3, but in the case of status code 404, it will run only once.
    maxAttempts: 3,

    shouldStop: function (error) {
      // A request that results in a status code of 400 and above, will throw
      // an Error, that contains a custom property "statusCode".
      return error.statusCode && error.statusCode === 404
    },
  })

  await downloader.download()
}

const installErrorHandlers = () => {
  process.on('uncaughtException', (err) => {
    console.error('Caught exception:', err)
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
  const coinListEndpoint = coinGeckoApiBaseUrl + '/coins/list?include_platform=true'
  const coinListResponse = await fetch(coinListEndpoint)
  if (!coinListResponse.ok) {
    throw new Error(`Error fetching coin list from CoinGecko: ${coinListResponse.status} ${coinListResponse.statusText}`)
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
  const coinMarketEndpoint = coinGeckoApiBaseUrl + '/coins/markets?vs_currency=usd&category=ethereum-ecosystem&order=market_cap_desc&per_page=250&page=1&sparkline=false'
  const coinMarketResponse = await fetch(coinMarketEndpoint)
  if (!coinMarketResponse.ok) {
    throw new Error(`Error fetching coin market data: ${coinMarketResponse.status} ${coinMarketResponse.statusText}`)
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
  for (const [key, value] of Object.entries(fullTokenList)) {
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
    'name': 'Basic Attention Token',
    'logo': 'bat.png',
    'erc20': true,
    'symbol': 'BAT',
    'decimals': 18
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
  const dappRadarProjectId = process.env.DAPP_RADAR_PROJECT_ID
  const dappRadarApiKey = process.env.DAPP_RADAR_API_KEY
  const metric = 'uaw'
  const range = '30d'

  for (const top of [100, 50, 25, 10]) {
    const url = `https://api.dappradar.com/${dappRadarProjectId}/dapps/top/${metric}?chain=${chain}&range=${range}&top=${top}`
    const response = await fetch(url, {
      headers: {
        'X-BLOBR-KEY': dappRadarApiKey,
      },
    })

    if (!response.ok) {
      console.error(`Error: [chain=${chain} top=${top}] ${response.status} ${response.statusText}`)
      continue
    }

    const dapps = await response.json()

    // Remove socialLinks and fullDescription from each dApp object
    dapps.results = dapps.results.map(dapp => {
      const { socialLinks, fullDescription, ...filteredDapp } = dapp
      return filteredDapp
    })

    // Replace 'binance-smart-chain' with 'binance_smart_chain' so it plays well
    // with the browser JSON parser.
    if (chain === 'binance-smart-chain') {
      chain = 'binance_smart_chain'
    }
    
    return dapps
  }

  throw new Error(`Error fetching dApps for ${chain}`)
}

const generateDappLists = async () => {
  const chains = [
    'solana',
    'ethereum',
    'polygon',
    'binance-smart-chain',
    'optimism',
    'aurora',
    'avalanche',
    'fantom',
  ]
  const dappLists = {}
  for (let chain of chains) {
    dappLists[chain] = await generateDappListsForChain(chain)
  }

  return dappLists
}

const addSupportedCoinbaseTokens = async (rampTokens) => {
    // Public Coinbase API url
    const coinbaseApiUrl = 'https://api.exchange.coinbase.com/currencies';

    // Maps Coinbase's network IDs to our hex chain IDs
    const networkIdMap = {
        "ethereum": "0x1",
        "kava": "0x8ae",
        "solana": "0x65",
        "arbitrum": "0xa4b1",
        "optimism": "0xa",
        "ethereumclassic": "0x3d",
        "avacchain": "0xa86a",
        "polygon": "0x89",
        "celo": "0xa4ec"
    };

    let response = await fetch(coinbaseApiUrl);
    let coinbaseTokens = await response.json();

    // Convert array to a map for efficient lookup using compound key
    let tokenMap = new Map(rampTokens.tokens.map(token => [`${token.chain_id}-${token.contract_address?.toLowerCase()}`, token]));

    for (let currency of coinbaseTokens) {
        // Skip the token if the name or symbol are missing
        if (currency.name === null || currency.id === null) {
            continue;
        }
        
        for (let network of currency.supported_networks) {
            let networkHexId = networkIdMap[network.id];
            if (!networkHexId) {
                continue;
            }

            let correspondingToken = tokenMap.get(`${networkHexId}-${network.contract_address?.toLowerCase()}`);

            if (correspondingToken) {
                if (!correspondingToken.on_ramp_providers.includes("coinbase")) {
                    correspondingToken.on_ramp_providers.push("coinbase");
                }
            } else {
                let newToken = {
                    contract_address: network.contract_address || "", // Empty string allowed for native tokens.
                    name: currency.name,
                    logo: "",
                    is_erc20: network.contract_address !== null,
                    is_erc721: false,
                    is_erc1155: false,
                    is_nft: false,
                    symbol: currency.id,
                    decimals: 18, // Adding decimals since it's required by the parser, but it's not used for on ramp tokens.
                    visible: true,
                    token_id: "",
                    coingecko_id: "",
                    chain_id: networkHexId,
                    coin: network.id === "solana" ? 501 : 60,
                    on_ramp_providers: ["coinbase"],
                    off_ramp_providers: []
                };
                tokenMap.set(`${networkHexId}-${network.contract_address?.toLowerCase()}`, newToken);
            }
        }
    }

    // Convert back to array format for return
    rampTokens.tokens = Array.from(tokenMap.values());

    return rampTokens;
}


const addSupportedSardineCurrencies = async (onRampCurrencies) => {
  const sardine = "sardine"
  const sardineApiUrl = "https://api.sandbox.sardine.ai/v1/geo-coverage";
  const response = await fetch(sardineApiUrl);
  const jsonResponse = await response.json();
  const currencyCodes = [];

  for (let country of jsonResponse.data) {
    if (country.isAllowedOnRamp) {
      if (!currencyCodes.includes(country.currencyCode)) {
        currencyCodes.push(country.currencyCode);
      }
    }
  }

  // Create a dictionary for quick lookups
  const currencyLookup = {};
  onRampCurrencies.currencies.forEach((currency) => {
    currencyLookup[currency.currency_code] = currency;
  });

  for (let currencyCode of currencyCodes) {
    const existingCurrency = currencyLookup[currencyCode];

    if (existingCurrency) {
      // If "sardine" isn't already in the providers array, add it
      if (!existingCurrency.providers.includes(sardine)) {
        existingCurrency.providers.push(sardine);
      }
    } else {
      // If the currency doesn't exist, create a new entry
      const newCurrency = {
        currency_code: currencyCode,
        currency_name: "",
        providers: [sardine],
      };
      onRampCurrencies.currencies.push(newCurrency);
      currencyLookup[currencyCode] = newCurrency;
    }
  }

  return onRampCurrencies
};

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
  const assetPlatformsMap = assetPlatformsList
    .reduce((acc, platform) => {
      // Manually add Solana chain identifier since it's not in the CoinGecko
      // asset platforms list
      if (platform.id === 'solana' && !platform.chain_identifier) {
        platform.chain_identifier = 101
      }

      acc[platform.id] = platform.chain_identifier
      return acc
    }, {})

  return coinList.reduce((acc, coin) => {
    Object.entries(coin.platforms)
      .forEach(([platform, contractAddress]) => {
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
}

const injectCoingeckoIds = (tokensListMap, coingeckoIds) =>
  Object.entries(tokensListMap).reduce((acc, [contractAddress, token]) => {
    const chainIdMap = coingeckoIds[token.chainId] || {}
    const coingeckoId = chainIdMap[contractAddress] || chainIdMap[contractAddress.toLowerCase()]
    if (!coingeckoId) {
      console.log(
        `[WARN] Coingecko ID missing:
        chainId=${token.chainId} contract=${contractAddress}`
      )
      return acc
    }

    if (token.coingeckoId && token.coingeckoId !== coingeckoId) {
      console.log(
        `[ERR] Coingecko ID mismatch:
        want=${coingeckoId} got=${token.coingeckoId} contract=${contractAddress}`
      )
      return acc
    }

    acc[contractAddress] = { ...token, coingeckoId }
    return acc
  }, {})

const fetchGitHubFileContent = async (repoOwner, repoName, branch, filePath, githubHeaders) => {
  const contentApiUrl = `https://api.github.com/repos/${repoOwner}/${repoName}/contents/${filePath}?ref=${branch}`;

  const contentResponse = await fetch(contentApiUrl, { headers: githubHeaders });
  const contentData = await contentResponse.json();

  if (!contentData.content) {
    console.error('Failed to fetch content for file:', filePath, contentData.message || 'Unknown error');
    return '';
  }

  return Buffer.from(contentData.content, 'base64').toString('utf-8');
};

const fetchGitHubRepoTopLevelFiles = async (repoOwner, repoName, branch) => {
  const githubToken = process.env.GITHUB_TOKEN;
  const githubHeaders = {
      "Accept": "application/vnd.github.v3+json",
      "Authorization": `token ${githubToken}`
  };

  const chainIdLookup = {
    'ARB': '0xa4b1',
    'BCH': 'BCH',
    'BSC': '0x38',
    'BSV': 'BSV',
    'BTG': 'BTG',
    'DASH': 'DASH',
    'ETC': '0x3d',
    'ETH': '0x1',
    'LTC': 'LTC',
    'USDT': '0x1',
    'XBT': 'bitcoin_mainnet',
    'XMR': 'XMR',
    'XRP': 'XRP',
    'XVG': 'XVG',
    'ZEC': 'ZEC'
  };

  const apiUrl = `https://api.github.com/repos/${repoOwner}/${repoName}/git/trees/${branch}?recursive=1`;

  const response = await fetch(apiUrl, { headers: githubHeaders });
  const data = await response.json();

  if (!data.tree) {
    console.error('Failed to fetch files:', data.message);
    return;
  }

  const jsonFiles = [];
  for (const item of data.tree) {
      if (item.type === 'blob' &&
          !item.path.includes('/') &&
          item.path.endsWith('.json') &&
          item.path !== 'README.md') {
          jsonFiles.push(item);
      }
  }

  const aggregatedData = {};
  for (const file of jsonFiles) {
    const content = await fetchGitHubFileContent(repoOwner, repoName, branch, file.path, githubHeaders); 
    const parsedContent = JSON.parse(content);
    
    const chainIdSymbol = file.path.replace('sanctioned_addresses_', '').replace('.json', '');

    const numericalChainId = chainIdLookup[chainIdSymbol];

    aggregatedData[numericalChainId] = parsedContent;
  }

  console.log(aggregatedData);
  return aggregatedData
}


module.exports = {
  contractReplaceSvgToPng,
  contractAddExtraMainnetAssets,
  installErrorHandlers,
  saveToPNGResize,
  download,
  generateMainnetTokenList,
  generateDappLists,
  addSupportedCoinbaseTokens,
  addSupportedSardineCurrencies,
  generateCoingeckoIds,
  generateChainList,
  injectCoingeckoIds,
  fetchGitHubRepoTopLevelFiles 
}
