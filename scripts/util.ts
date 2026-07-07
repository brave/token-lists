import type { AssetPlatform, CoinListItem } from './lib/coingecko';
import trustedCoingeckoIdsByChainId from '../data/solana/trusted-coingecko-ids.json' with { type: 'json' };

interface TokenMetadata {
  name: string;
  logo?: string;
  erc20?: boolean;
  symbol?: string;
  decimals?: number;
}

type TokenMap = Record<string, TokenMetadata>;

type TokenMapWithChainId = Record<string, TokenMetadata & { chainId: string }>;

interface TopCoin {
  id: string;
  symbol: string;
  name: string;
}

interface CoinbaseNetwork {
  id: string;
  contract_address: string | null;
}

interface CoinbaseCurrency {
  id: string | null;
  name: string | null;
  supported_networks: CoinbaseNetwork[];
}

interface RampToken {
  contract_address: string;
  name: string;
  logo: string;
  is_erc20: boolean;
  is_erc721: boolean;
  is_erc1155: boolean;
  is_nft: boolean;
  symbol: string;
  decimals: number;
  visible: boolean;
  token_id: string;
  coingecko_id: string;
  chain_id: string;
  coin: number;
  on_ramp_providers: string[];
  off_ramp_providers: string[];
}

interface RampTokenList {
  tokens: RampToken[];
}

interface OnRampCurrency {
  currency_code: string;
  currency_name: string;
  providers: string[];
}

interface OnRampCurrencyList {
  currencies: OnRampCurrency[];
}

interface SardineCountry {
  isAllowedOnRamp: boolean;
  currencyCode: string;
}

export const installErrorHandlers = (): void => {
  process.on('uncaughtException', (err) => {
    console.error((err as Error).stack);
    process.exit(1);
  });

  process.on('unhandledRejection', (err) => {
    console.error('Unhandled rejection:', err);
    process.exit(1);
  });
};

export const generateMainnetTokenList = async (
  fullTokenList: TokenMap,
): Promise<TokenMapWithChainId> => {
  const MAX_TOKEN_LIST_SIZE = 100;
  const coinGeckoApiBaseUrl = 'https://api.coingecko.com/api/v3';

  const coinListResponse = await fetch(`${coinGeckoApiBaseUrl}/coins/list?include_platform=true`);
  if (!coinListResponse.ok) {
    throw new Error(
      `Error fetching coin list from CoinGecko: ${coinListResponse.status} ${coinListResponse.statusText}`,
    );
  }
  const coinList = (await coinListResponse.json()) as CoinListItem[];

  const contractAddresses: Record<string, string> = {};
  for (const coin of coinList) {
    if (coin.platforms && coin.platforms.ethereum) {
      contractAddresses[coin.id] = coin.platforms.ethereum;
    }
  }

  const coinMarketResponse = await fetch(
    `${coinGeckoApiBaseUrl}/coins/markets?vs_currency=usd&category=ethereum-ecosystem&order=market_cap_desc&per_page=250&page=1&sparkline=false`,
  );
  if (!coinMarketResponse.ok) {
    throw new Error(
      `Error fetching coin market data: ${coinMarketResponse.status} ${coinMarketResponse.statusText}`,
    );
  }
  const topCoins = (await coinMarketResponse.json()) as TopCoin[];

  // The token list uses checksum addresses; the CoinGecko API returns lowercase.
  const checksumAddresses: Record<string, string> = {};
  for (const key of Object.keys(fullTokenList)) {
    checksumAddresses[key.toLowerCase()] = key;
  }

  const outputTokenList: TokenMap = {};
  for (const coin of topCoins) {
    const contractAddress = contractAddresses[coin.id];
    if (contractAddress) {
      const checksumAddress = checksumAddresses[contractAddress.toLowerCase()];
      if (checksumAddress && fullTokenList[checksumAddress]) {
        outputTokenList[checksumAddress] = fullTokenList[checksumAddress];
        if (Object.keys(outputTokenList).length === MAX_TOKEN_LIST_SIZE) {
          break;
        }
      }
    }
  }

  // BAT is always added.
  outputTokenList['0x0D8775F648430679A709E98d2b0Cb6250d2887EF'] = {
    name: 'Basic Attention Token',
    logo: 'bat.png',
    erc20: true,
    symbol: 'BAT',
    decimals: 18,
  };

  return Object.keys(outputTokenList).reduce<TokenMapWithChainId>((acc, contractAddress) => {
    acc[contractAddress] = {
      ...outputTokenList[contractAddress],
      chainId: '0x1',
    };
    return acc;
  }, {});
};

export const addSupportedCoinbaseTokens = async (rampTokens: RampTokenList): Promise<RampTokenList> => {
  const coinbaseApiUrl = 'https://api.exchange.coinbase.com/currencies';

  const networkIdMap: Record<string, string> = {
    ethereum: '0x1',
    kava: '0x8ae',
    solana: '0x65',
    arbitrum: '0xa4b1',
    optimism: '0xa',
    ethereumclassic: '0x3d',
    avacchain: '0xa86a',
    polygon: '0x89',
    celo: '0xa4ec',
  };

  const response = await fetch(coinbaseApiUrl);
  const coinbaseTokens = (await response.json()) as CoinbaseCurrency[];

  const tokenMap = new Map<string, RampToken>(
    rampTokens.tokens.map((token) => [
      `${token.chain_id}-${token.contract_address?.toLowerCase()}`,
      token,
    ]),
  );

  for (const currency of coinbaseTokens) {
    if (currency.name === null || currency.id === null) {
      continue;
    }

    for (const network of currency.supported_networks) {
      const networkHexId = networkIdMap[network.id];
      if (!networkHexId) {
        continue;
      }

      const correspondingToken = tokenMap.get(
        `${networkHexId}-${network.contract_address?.toLowerCase()}`,
      );

      if (correspondingToken) {
        if (!correspondingToken.on_ramp_providers.includes('coinbase')) {
          correspondingToken.on_ramp_providers.push('coinbase');
        }
      } else {
        const newToken: RampToken = {
          contract_address: network.contract_address || '',
          name: currency.name,
          logo: '',
          is_erc20: network.contract_address !== null,
          is_erc721: false,
          is_erc1155: false,
          is_nft: false,
          symbol: currency.id,
          decimals: 18,
          visible: true,
          token_id: '',
          coingecko_id: '',
          chain_id: networkHexId,
          coin: network.id === 'solana' ? 501 : 60,
          on_ramp_providers: ['coinbase'],
          off_ramp_providers: [],
        };
        tokenMap.set(
          `${networkHexId}-${network.contract_address?.toLowerCase()}`,
          newToken,
        );
      }
    }
  }

  rampTokens.tokens = Array.from(tokenMap.values());

  return rampTokens;
};

export const addSupportedSardineCurrencies = async (
  onRampCurrencies: OnRampCurrencyList,
): Promise<OnRampCurrencyList> => {
  const sardine = 'sardine';
  const sardineApiUrl = 'https://api.sandbox.sardine.ai/v1/geo-coverage';
  const response = await fetch(sardineApiUrl);
  const jsonResponse = (await response.json()) as { data: SardineCountry[] };
  const currencyCodes: string[] = [];

  for (const country of jsonResponse.data) {
    if (country.isAllowedOnRamp) {
      if (!currencyCodes.includes(country.currencyCode)) {
        currencyCodes.push(country.currencyCode);
      }
    }
  }

  const currencyLookup: Record<string, OnRampCurrency> = {};
  onRampCurrencies.currencies.forEach((currency) => {
    currencyLookup[currency.currency_code] = currency;
  });

  for (const currencyCode of currencyCodes) {
    const existingCurrency = currencyLookup[currencyCode];

    if (existingCurrency) {
      if (!existingCurrency.providers.includes(sardine)) {
        existingCurrency.providers.push(sardine);
      }
    } else {
      const newCurrency: OnRampCurrency = {
        currency_code: currencyCode,
        currency_name: '',
        providers: [sardine],
      };
      onRampCurrencies.currencies.push(newCurrency);
      currencyLookup[currencyCode] = newCurrency;
    }
  }

  return onRampCurrencies;
};

interface ChainListEntry {
  name: string;
  chainId: number;
  shortName: string;
  networkId: number;
  nativeCurrency: { name: string; symbol: string; decimals: number };
  rpc: string[];
  [key: string]: unknown;
}

export const generateChainList = async (): Promise<ChainListEntry[]> => {
  const chainListResponse = await fetch('https://chainid.network/chains.json');
  if (!chainListResponse.ok) {
    throw new Error(
      `Error fetching chain list from chainid.network: ${chainListResponse.status} ${chainListResponse.statusText}`,
    );
  }

  return (await chainListResponse.json()) as ChainListEntry[];
};

export const generateCoingeckoIds = async (): Promise<Record<string, Record<string, string>>> => {
  const coinGeckoApiBaseUrl = 'https://api.coingecko.com/api/v3';

  const coinListResponse = await fetch(`${coinGeckoApiBaseUrl}/coins/list?include_platform=true`);
  if (!coinListResponse.ok) {
    throw new Error(
      `Error fetching coin list from CoinGecko: ${coinListResponse.status} ${coinListResponse.statusText}`,
    );
  }
  const coinList = (await coinListResponse.json()) as CoinListItem[];

  const assetPlatformsResponse = await fetch(`${coinGeckoApiBaseUrl}/asset_platforms`);
  if (!assetPlatformsResponse.ok) {
    throw new Error(
      `Error fetching asset platforms from CoinGecko: ${assetPlatformsResponse.status} ${assetPlatformsResponse.statusText}`,
    );
  }
  const assetPlatformsList = (await assetPlatformsResponse.json()) as AssetPlatform[];

  const assetPlatformsMap = assetPlatformsList.reduce<Record<string, number | null>>((acc, platform) => {
    // Manually add Solana chain identifier; not in the CoinGecko asset platforms list.
    if (platform.id === 'solana' && !platform.chain_identifier) {
      platform.chain_identifier = 101;
    }

    // Manually add Tempo chain identifier; not in the CoinGecko asset platforms list.
    if (platform.id === 'tempo' && !platform.chain_identifier) {
      platform.chain_identifier = 4217;
    }

    acc[platform.id] = platform.chain_identifier;
    return acc;
  }, {});

  const coingeckoIdsByChainId = coinList.reduce<Record<string, Record<string, string>>>((acc, coin) => {
    Object.entries(coin.platforms).forEach(([platform, contractAddress]) => {
      const chainId = assetPlatformsMap[platform];
      if (!chainId || !contractAddress) {
        return;
      }

      const chainIdHex = `0x${chainId.toString(16)}`;
      if (acc[chainIdHex]) {
        acc[chainIdHex][contractAddress] = coin.id;
      } else {
        acc[chainIdHex] = {
          [contractAddress]: coin.id,
        };
      }
    });

    return acc;
  }, {});

  const trusted = trustedCoingeckoIdsByChainId as Record<string, Record<string, string>>;

  return Object.fromEntries(
    Object.keys(coingeckoIdsByChainId).map((chainId) => [
      chainId,
      {
        ...coingeckoIdsByChainId[chainId],
        ...trusted[chainId],
      },
    ]),
  );
};

interface GitHubTreeItem {
  type: string;
  path: string;
}

interface GitHubTreeResponse {
  tree?: GitHubTreeItem[];
  message?: string;
}

interface GitHubContentResponse {
  content?: string;
  message?: string;
}

const fetchGitHubFileContent = async (
  repoOwner: string,
  repoName: string,
  branch: string,
  filePath: string,
  githubHeaders: Record<string, string>,
): Promise<string> => {
  const contentApiUrl = `https://api.github.com/repos/${repoOwner}/${repoName}/contents/${filePath}?ref=${branch}`;

  const contentResponse = await fetch(contentApiUrl, { headers: githubHeaders });
  const contentData = (await contentResponse.json()) as GitHubContentResponse;

  if (!contentData.content) {
    console.error('Failed to fetch content for file:', filePath, contentData.message || 'Unknown error');
    return '';
  }

  return Buffer.from(contentData.content, 'base64').toString('utf-8');
};

export const fetchGitHubRepoTopLevelFiles = async (
  repoOwner: string,
  repoName: string,
  branch: string,
): Promise<{ addresses: string[] } | undefined> => {
  const githubToken = process.env.API_AUTH_TOKEN_GITHUB;
  const githubHeaders: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
    Authorization: `token ${githubToken}`,
  };

  const apiUrl = `https://api.github.com/repos/${repoOwner}/${repoName}/git/trees/${branch}?recursive=1`;
  const response = await fetch(apiUrl, { headers: githubHeaders });
  const data = (await response.json()) as GitHubTreeResponse;

  if (!data.tree) {
    console.error('Failed to fetch files:', data.message);
    return;
  }

  const jsonFiles: GitHubTreeItem[] = [];
  for (const item of data.tree) {
    if (
      item.type === 'blob' &&
      !item.path.includes('/') &&
      item.path.endsWith('.json') &&
      item.path !== 'README.md'
    ) {
      jsonFiles.push(item);
    }
  }

  let bannedAddresses: string[] = [];
  for (const file of jsonFiles) {
    const content = await fetchGitHubFileContent(repoOwner, repoName, branch, file.path, githubHeaders);
    const bannedAddressesForFile = JSON.parse(content) as string[];
    bannedAddresses = [...bannedAddressesForFile, ...bannedAddresses];
  }
  bannedAddresses = [...new Set(bannedAddresses)];

  return { addresses: bannedAddresses };
};

/**
 * Sorts a token list JSON object by chain IDs and contract addresses while preserving
 * the order of token metadata properties (name, symbol, coingeckoId, decimals, logo, etc.)
 */
export const sortTokenListJson = <T extends Record<string, Record<string, unknown>>>(tokenListJson: T): T => {
  return Object.keys(tokenListJson)
    .sort()
    .reduce<Record<string, Record<string, unknown>>>((result, chainId) => {
      const chainTokens = tokenListJson[chainId];
      result[chainId] = Object.keys(chainTokens)
        .sort()
        .reduce<Record<string, unknown>>((sortedTokens, address) => {
          sortedTokens[address] = chainTokens[address];
          return sortedTokens;
        }, {});
      return result;
    }, {}) as T;
};
