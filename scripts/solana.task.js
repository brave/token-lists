import path from "path";
import fs from "fs";
import axios from "axios";

import {
  Generator,
  ProviderCoinGecko,
  ProviderIgnore,
  ChainId,
  Tag,
} from "@solflare-wallet/utl-aggregator";

const sec = 1000;

async function generateTokensList() {
  const trustedTokenListUrl =
    process.env.TRUSTED_TOKEN_LIST_URL ??
    "https://cdn.jsdelivr.net/gh/brave/token-lists@main/data/solana/trusted-tokenlist.json";

  const trustedTokenListResp = await axios.get(trustedTokenListUrl);
  const trustedTokenList = trustedTokenListResp.data;

  const coinGeckoApiKey = process.env.COINGECKO_API_KEY ?? null;
  const rpcUrlMainnet = process.env.SOLANA_MAINNET_RPC_URL;

  const generator = new Generator(
    [
      new ProviderCoinGecko(coinGeckoApiKey, rpcUrlMainnet, {
        throttle: 200,
        throttleCoinGecko: 65 * sec,
        batchAccountsInfo: 200,
        batchCoinGecko: 5,
      }),
    ],
    [
      new ProviderIgnore(
        "https://raw.githubusercontent.com/solflare-wallet/token-list/master/ignore-tokenlist.json",
        [],
        ChainId.MAINNET
      ),
    ]
  );

  const tokenMap = await generator.generateTokenList();
  const tokenMapWithTrustedList = {
    ...tokenMap,
    tokens: [
      ...tokenMap.tokens,
      ...trustedTokenList.tokens.filter(
        (token) =>
          tokenMap.tokens.findIndex((t) => t.address === token.address) === -1
      ),
    ],
  };

  fs.writeFileSync(
    path.join("data", "solana", "tokenlist.json"),
    JSON.stringify(tokenMapWithTrustedList, null, 2)
  );
  return tokenMap;
}

await generateTokensList();
