import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';

import { generateMainnetTokenList } from '../scripts/util';
import fullContractMap from './fixtures/full-contract-map.json' with { type: 'json' };

const BAT_ADDRESS = '0x0D8775F648430679A709E98d2b0Cb6250d2887EF';
const COINGECKO_COIN_LIST = 'https://api.coingecko.com/api/v3/coins/list?include_platform=true';
const COINGECKO_MARKETS_PREFIX = 'https://api.coingecko.com/api/v3/coins/markets';

interface MockResponses {
  coinList?: unknown;
  coinListStatus?: number;
  markets?: unknown;
  marketsStatus?: number;
}

const installFetchMock = (responses: MockResponses): void => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = typeof input === 'string' ? input : input.toString();

    if (url === COINGECKO_COIN_LIST) {
      return new Response(JSON.stringify(responses.coinList ?? []), {
        status: responses.coinListStatus ?? 200,
      });
    }

    if (url.startsWith(COINGECKO_MARKETS_PREFIX)) {
      return new Response(JSON.stringify(responses.markets ?? []), {
        status: responses.marketsStatus ?? 200,
      });
    }

    throw new Error(`Unexpected fetch URL: ${url}`);
  });
};

describe('generateMainnetTokenList', () => {
  beforeEach(() => {
    installFetchMock({});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('always includes BAT even when the input token list is empty', async () => {
    const result = await generateMainnetTokenList({});

    expect(result[BAT_ADDRESS]?.symbol).toBe('BAT');
    expect(result[BAT_ADDRESS]?.decimals).toBe(18);
  });

  test('every output token is tagged with chainId 0x1', async () => {
    const result = await generateMainnetTokenList({});

    for (const token of Object.values(result)) {
      expect(token.chainId).toBe('0x1');
    }
  });

  test('includes tokens that appear in both the contract map (case-insensitive) and CoinGecko top markets', async () => {
    // CoinGecko returns lowercase addresses; the contract map stores EIP-55 checksum addresses.
    // The function must reconcile by lowercasing both sides.
    installFetchMock({
      coinList: [
        { id: 'cow-protocol', symbol: 'cow', name: 'CoW Protocol', platforms: { ethereum: '0xdef1ca1fb7fbcdc777520aa7f396b4e015f497ab' } },
        { id: 'alchemy-pay', symbol: 'ach', name: 'Alchemy Pay', platforms: { ethereum: '0xed04915c23f00a313a544955524eb7dbd823143d' } },
      ],
      markets: [
        { id: 'cow-protocol', symbol: 'cow', name: 'CoW Protocol' },
        { id: 'alchemy-pay', symbol: 'ach', name: 'Alchemy Pay' },
      ],
    });

    const result = await generateMainnetTokenList(fullContractMap);

    expect(result['0xDEf1CA1fb7FBcDC777520aa7f396b4E015F497aB']?.symbol).toBe('COW');
    expect(result['0xEd04915c23f00A313a544955524EB7DBD823143d']?.symbol).toBe('ACH');
  });

  test('caps the output list at 100 entries plus BAT', async () => {
    // Build 150 fake coins that all resolve to addresses in fullContractMap.
    const contractAddresses = Object.keys(fullContractMap).slice(0, 150);
    const coinList = contractAddresses.map((addr, i) => ({
      id: `coin-${i}`,
      symbol: `c${i}`,
      name: `Coin ${i}`,
      platforms: { ethereum: addr.toLowerCase() },
    }));
    const markets = coinList.map(({ id, symbol, name }) => ({ id, symbol, name }));

    installFetchMock({ coinList, markets });

    const result = await generateMainnetTokenList(fullContractMap);

    // 100 tokens from the loop (capped) + BAT (always added, unless BAT was already among the first 100).
    const expectedCount = contractAddresses.slice(0, 100).includes(BAT_ADDRESS) ? 100 : 101;
    expect(Object.keys(result)).toHaveLength(expectedCount);
  });

  test('throws when the CoinGecko coin list endpoint returns an error', async () => {
    installFetchMock({ coinListStatus: 500 });

    await expect(generateMainnetTokenList({})).rejects.toThrow(
      /Error fetching coin list from CoinGecko: 500/,
    );
  });

  test('throws when the CoinGecko markets endpoint returns an error', async () => {
    installFetchMock({ marketsStatus: 503 });

    await expect(generateMainnetTokenList({})).rejects.toThrow(
      /Error fetching coin market data: 503/,
    );
  });
});
