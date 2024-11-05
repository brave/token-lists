import fetch from 'node-fetch';

const COINGECKO_API_URL = 'https://api.coingecko.com/api/v3';
const RATE_LIMIT_DELAY = 7100; // over 6s to stay under rate limits

// Sleep utility function
const sleep = (ms: number): Promise<void> => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

export interface AssetPlatform {
  id: string;
  chain_identifier: number | null;
  name: string;
  native_coin_id: string;
  image: {
    large: string;
  }
}

interface CoinListItem {
  id: string;
  symbol: string;
  name: string;
  platforms: Record<string, string>;
}

interface CoinMarket {
  id: string;
  symbol: string;
  name: string;
  market_cap_rank: number | null;
  image: string;
}

class CoinGeckoAPI {
  private async fetchWithRetry(endpoint: string, retries = 3): Promise<any> {
    const options ={
      headers: {
        'Accept': 'application/json'
      }
    };

    for (let i = 0; i < retries; i++) {
      try {
        const response = await fetch(`${COINGECKO_API_URL}${endpoint}`, options);
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        await sleep(RATE_LIMIT_DELAY);
        return data;
      } catch (error) {
        if (i === retries - 1) throw error;
        await sleep(RATE_LIMIT_DELAY * 2); // Wait longer between retries
      }
    }
  }

  async getAssetPlatforms(): Promise<AssetPlatform[]> {
    return this.fetchWithRetry('/asset_platforms');
  }

  async getCoinsList(): Promise<CoinListItem[]> {
    return this.fetchWithRetry('/coins/list?include_platform=true');
  }

  async getCoinMarkets(page = 1): Promise<CoinMarket[]> {
    return this.fetchWithRetry(
      `/coins/markets?vs_currency=usd&per_page=250&page=${page}&sparkline=false`
    );
  }

  async *streamCoinMarkets(): AsyncGenerator<CoinMarket, void, unknown> {
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const markets = await this.getCoinMarkets(page);
      if (markets.length === 0) {
        hasMore = false;
      } else {
        for (const market of markets) {
          yield market;
        }
        page++;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  async getAllCoinMarkets(): Promise<CoinMarket[]> {
    const allMarkets: CoinMarket[] = [];
    for await (const market of this.streamCoinMarkets()) {
      allMarkets.push(market);
    }
    return allMarkets;
  }
}

// Export a singleton instance
export default new CoinGeckoAPI();
