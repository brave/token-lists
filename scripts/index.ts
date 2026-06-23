import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import path from 'node:path';

import {
  addSupportedCoinbaseTokens,
  addSupportedSardineCurrencies,
  fetchGitHubRepoTopLevelFiles,
  generateChainList,
  generateCoingeckoIds,
  installErrorHandlers,
} from './util';

const stagePackageJson = (stagingDir: string): void => {
  const packageJson = JSON.parse(fs.readFileSync('./package.json', 'utf-8'));
  packageJson.name = '@brave/wallet-lists';
  packageJson.publishConfig = { access: 'public' };
  packageJson.scripts = {};
  packageJson.devDependencies = {};
  packageJson.dependencies = {};
  packageJson.engines = {};
  delete packageJson.type;
  fs.writeFileSync(path.join(stagingDir, 'package.json'), JSON.stringify(packageJson, null, 2));
};

const stageChainListJson = async (stagingDir: string): Promise<void> => {
  const dstPath = path.join(stagingDir, 'chainlist.json');
  const chainList = await generateChainList();
  fs.writeFileSync(dstPath, JSON.stringify(chainList, null, 2));
};

const stageManifest = (stagingDir: string): void => {
  const manifestPath = path.join('data', 'manifest.json');
  const outputManifestPath = path.join(stagingDir, 'manifest.json');
  fs.copyFileSync(manifestPath, outputManifestPath);
};

const stageCoingeckoIds = async (stagingDir: string): Promise<void> => {
  const dstPath = path.join(stagingDir, 'coingecko-ids.json');
  const coingeckoIds = await generateCoingeckoIds();
  await fsPromises.writeFile(dstPath, JSON.stringify(coingeckoIds, null, 2));
};

const stageOnRampLists = async (stagingDir: string): Promise<void> => {
  const srcOnRampTokensPath = path.join('data', 'onramps', 'on-ramp-token-lists.json');
  const dstOnRampTokensPath = path.join(stagingDir, 'on-ramp-token-lists.json');
  await fsPromises.copyFile(srcOnRampTokensPath, dstOnRampTokensPath);

  const srcOffRampTokensPath = path.join('data', 'onramps', 'off-ramp-token-lists.json');
  const dstOffRampTokensPath = path.join(stagingDir, 'off-ramp-token-lists.json');
  await fsPromises.copyFile(srcOffRampTokensPath, dstOffRampTokensPath);

  const srcRampTokensPath = path.join('data', 'onramps', 'ramp-tokens.json');
  const dstRampTokensPath = path.join(stagingDir, 'ramp-tokens.json');
  const srcRampTokensData = await fsPromises.readFile(srcRampTokensPath, 'utf-8');
  let rampTokens = JSON.parse(srcRampTokensData);
  rampTokens = await addSupportedCoinbaseTokens(rampTokens);
  await fsPromises.writeFile(dstRampTokensPath, JSON.stringify(rampTokens, null, 2));

  const srcOnRampCurrenciesPath = path.join('data', 'onramps', 'on-ramp-currency-lists.json');
  const dstOnRampCurrenciesPath = path.join(stagingDir, 'on-ramp-currency-lists.json');
  const srcOnRampCurrenciesData = await fsPromises.readFile(srcOnRampCurrenciesPath, 'utf-8');
  let onRampCurrencies = JSON.parse(srcOnRampCurrenciesData);
  onRampCurrencies = await addSupportedSardineCurrencies(onRampCurrencies);
  await fsPromises.writeFile(dstOnRampCurrenciesPath, JSON.stringify(onRampCurrencies, null, 2));
};

const stageOFACLists = async (stagingDir: string): Promise<void> => {
  const ofacLists = await fetchGitHubRepoTopLevelFiles(
    'brave-intl',
    'ofac-sanctioned-digital-currency-addresses',
    'lists',
  );
  const dstOfacListsPath = path.join(stagingDir, 'ofac-sanctioned-digital-currency-addresses.json');
  await fsPromises.writeFile(dstOfacListsPath, JSON.stringify(ofacLists, null, 2));
  const dstProhibitedAddressesPath = path.join(stagingDir, 'prohibited-addresses.json');
  await fsPromises.writeFile(dstProhibitedAddressesPath, JSON.stringify(ofacLists, null, 2));
};

const stageCoingeckoTokenList = async (stagingDir: string, filename: string): Promise<void> => {
  const srcTokenListPath = path.join('data', 'v1', filename);
  const dstTokenListPath = path.join(stagingDir, 'coingecko.json');
  await fsPromises.copyFile(srcTokenListPath, dstTokenListPath);
};

const stageTokenPackage = async (): Promise<void> => {
  const stagingDir = 'build';
  fs.mkdirSync(stagingDir, { recursive: true });

  await stageCoingeckoIds(stagingDir);
  await stageChainListJson(stagingDir);
  await stageOnRampLists(stagingDir);
  await stageOFACLists(stagingDir);
  await stageCoingeckoTokenList(stagingDir, 'coingecko-top5000.json');

  stagePackageJson(stagingDir);
  stageManifest(stagingDir);
};

installErrorHandlers();
await stageTokenPackage();
