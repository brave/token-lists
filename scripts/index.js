// Node imports
const fs = require('fs')
const fsPromises = require('fs/promises')
const path = require('path')

// Local module imports
const util = require('./util.cjs')

function stagePackageJson (stagingDir) {
  const packageJson = JSON.parse(fs.readFileSync('./package.json', 'utf-8'))
  packageJson.name = 'brave-wallet-lists'
  packageJson.scripts = {}
  packageJson.devDependencies = {}
  packageJson.dependencies = {}
  packageJson.engines = {}
  fs.writeFileSync(path.join(stagingDir, 'package.json'), JSON.stringify(packageJson, null, 2))
}

async function stageChainListJson (stagingDir) {
  const dstPath = path.join(stagingDir, 'chainlist.json')
  const chainList = await util.generateChainList()
  fs.writeFileSync(dstPath, JSON.stringify(chainList, null, 2))
}

function stageManifest (stagingDir) {
  const manifestPath = path.join('data', 'manifest.json')
  const outputManifestPath = path.join(stagingDir, 'manifest.json')
  fs.copyFileSync(manifestPath, outputManifestPath)
}

async function stageCoingeckoIds (stagingDir) {
  const dstPath = path.join(stagingDir, 'coingecko-ids.json')
  const coingeckoIds = await util.generateCoingeckoIds()
  await fsPromises.writeFile(dstPath, JSON.stringify(coingeckoIds, null, 2))
  return coingeckoIds
}

async function stageOnRampLists (stagingDir) {
  // The on-ramp-token-lists.json file is no longer used by the release version of the
  // browser.  It will be safe to remove in July, 2024.
  const srcOnRampTokensPath = path.join('data', 'onramps', 'on-ramp-token-lists.json')
  const dstOnRampTokensPath = path.join(stagingDir, 'on-ramp-token-lists.json')
  await fsPromises.copyFile(srcOnRampTokensPath, dstOnRampTokensPath)

  // The off-ramp-token-lists.json file is no longer used by the release version of the
  // browser.  It will be safe to remove in July, 2024.
  const srcOffRampTokensPath = path.join('data', 'onramps', 'off-ramp-token-lists.json')
  const dstOffRampTokensPath = path.join(stagingDir, 'off-ramp-token-lists.json')
  await fsPromises.copyFile(srcOffRampTokensPath, dstOffRampTokensPath)

  // ramp-tokens.json
  const srcRampTokensPath = path.join('data', 'onramps', 'ramp-tokens.json')
  const dstRampTokensPath = path.join(stagingDir, 'ramp-tokens.json')
  const srcRampTokensData = await fsPromises.readFile(srcRampTokensPath, 'utf-8')
  let rampTokens = JSON.parse(srcRampTokensData)
  rampTokens = await util.addSupportedCoinbaseTokens(rampTokens)
  await fsPromises.writeFile(dstRampTokensPath, JSON.stringify(rampTokens, null, 2))

  // on-ramp-currency-lists.json
  const srcOnRampCurrenciesPath = path.join('data', 'onramps', 'on-ramp-currency-lists.json')
  const dstOnRampCurrenciesPath = path.join(stagingDir, 'on-ramp-currency-lists.json')
  const srcOnRampCurrenciesData = await fsPromises.readFile(srcOnRampCurrenciesPath, 'utf-8')
  let onRampCurrencies = JSON.parse(srcOnRampCurrenciesData)
  onRampCurrencies = await util.addSupportedSardineCurrencies(onRampCurrencies)
  await fsPromises.writeFile(dstOnRampCurrenciesPath, JSON.stringify(onRampCurrencies, null, 2))
}

async function stageOFACLists (stagingDir) {
  const ofacLists = await util.fetchGitHubRepoTopLevelFiles('brave-intl', 'ofac-sanctioned-digital-currency-addresses', 'lists')
  const dstOfacListsPath = path.join(stagingDir, 'ofac-sanctioned-digital-currency-addresses.json')
  await fsPromises.writeFile(dstOfacListsPath, JSON.stringify(ofacLists, null, 2))
}

async function stageCoingeckoTokenList (stagingDir, filename) {
  const srcTokenListPath = path.join('data', 'v1', filename)
  const dstTokenListPath = path.join(stagingDir, 'coingecko.json')
  await fsPromises.copyFile(srcTokenListPath, dstTokenListPath)
}

async function stageTokenPackage () {
  const stagingDir = 'build'
  if (!fs.existsSync(stagingDir)) {
    fs.mkdirSync(stagingDir)
  }

  // Add coingecko-ids.json
  await stageCoingeckoIds(stagingDir)

  // Add chainlist.json.
  await stageChainListJson(stagingDir)

  // Add on ramp JSON files
  await stageOnRampLists(stagingDir)

  // Add OFAC banned address lists
  await stageOFACLists(stagingDir)

  // Add coingecko token list
  await stageCoingeckoTokenList(stagingDir, 'coingecko-top5000.json')

  stagePackageJson(stagingDir)
  stageManifest(stagingDir)
}

util.installErrorHandlers()
stageTokenPackage()
