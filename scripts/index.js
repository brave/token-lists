// Node imports
import fs from 'fs'
import fsPromises from 'fs/promises'
import os from 'os'
import path from 'path'

// NPM imports
import { Qyu } from 'qyu'

// Local module imports
import util from './util.cjs'

import imagemin from 'imagemin'
import imageminPngquant from 'imagemin-pngquant'

function getOutputTokenPath(stagingDir, inputTokenFilePath) {
  const tokenFilename = path.parse(inputTokenFilePath).base
  return path.join(stagingDir, tokenFilename)
}

async function stageEVMTokenFile(stagingDir, inputTokenFilePath, coingeckoIds) {
  // Read in the JSON file located at inputTokenFilePath
  const tokenList = JSON.parse(fs.readFileSync(inputTokenFilePath))
  const tokenListWithCoingeckoIds = util.injectCoingeckoIds(tokenList, coingeckoIds)

  // Write the output token list to the staging directory
  await fsPromises.writeFile(
    getOutputTokenPath(stagingDir, inputTokenFilePath),
    JSON.stringify(tokenListWithCoingeckoIds, null, 2)
  )
}

async function stageMainnetTokenFile(stagingDir, inputTokenFilePath, coingeckoIds) {
  // Read in the JSON file located at inputTokenFilePath
  const tokenList = JSON.parse(fs.readFileSync(inputTokenFilePath, 'utf-8'))
  // Ex.
  // {
  //   "0xBBc2AE13b23d715c30720F079fcd9B4a74093505": {
  //     "name": "Ethernity Chain Token",
  //     "logo": "ERN.png",
  //     "erc20": true,
  //     "symbol": "ERN",
  //     "decimals": 18
  //   },
  //  ...
  // }

  const outputTokenList = await util.generateMainnetTokenList(tokenList)
  const outputTokenListWithExtraAssets = util.contractAddExtraMainnetAssets(outputTokenList)
  const mainnetTokensWithCoingeckoIds = util.injectCoingeckoIds(outputTokenListWithExtraAssets, coingeckoIds)
 
  // Write the output token list to the staging directory
  await fsPromises.writeFile(
    getOutputTokenPath(stagingDir, inputTokenFilePath),
    JSON.stringify(mainnetTokensWithCoingeckoIds, null, 2)
  )
}

function stagePackageJson(stagingDir) {
  const packageJson = JSON.parse(fs.readFileSync('./package.json', 'utf-8'))
  packageJson.name = 'brave-wallet-lists'
  packageJson.scripts = {}
  packageJson.devDependencies = {}
  packageJson.dependencies = {}
  packageJson.engines = {}
  fs.writeFileSync(path.join(stagingDir, 'package.json'), JSON.stringify(packageJson, null, 2));
}

async function stageChainListJson(stagingDir) {
  const dstPath = path.join(stagingDir, 'chainlist.json')
  const chainList = await util.generateChainList()
  fs.writeFileSync(dstPath, JSON.stringify(chainList, null, 2))
}

function stageManifest(stagingDir) {
  const manifestPath = path.join('data', 'manifest.json');
  const outputManifestPath = path.join(stagingDir, 'manifest.json');
  fs.copyFileSync(manifestPath, outputManifestPath)
}

async function stageEVMTokenImages(stagingDir, inputTokenFilePath) {
  const outputTokenFilePath = getOutputTokenPath(stagingDir, inputTokenFilePath);
  const baseSrcTokenPath = path.dirname(inputTokenFilePath)
  // Copy images and convert them to png plus resize to 200x200 if needed
  const imagesSrcPath = path.join(baseSrcTokenPath, "images")
  const imagesDstPath = path.join(stagingDir, "imagesUncompressed")
  const files = fs.readdirSync(imagesSrcPath)
  if (!fs.existsSync(imagesDstPath)){
    fs.mkdirSync(imagesDstPath)
  }
  for (var i = 0; i < files.length; i++) {
    var file = files[i]
    var fileTo = file.substr(0, file.lastIndexOf(".")) + ".png"
    var fromPath = path.join(imagesSrcPath, file)
    var toPath = path.join(imagesDstPath, fileTo)

    if (fs.existsSync(toPath)) {
      try {
        fs.unlinkSync(toPath)
      } catch (e) {
        console.log(`Failed to remove: ${toPath}`)
      }
    }

    try {
      await util.saveToPNGResize(fromPath, toPath, false)
    } catch (e) {
      console.log(`Failed to resize: ${fromPath}`)
    }
  }
  util.contractReplaceSvgToPng(outputTokenFilePath)
}

async function compressPng(imagesDstPath, stagingDir) {
  console.log('compressing png images...')
  if (!fs.existsSync(stagingDir + '/images')) {
    fs.mkdirSync(stagingDir + '/images')
  }
  await imagemin([imagesDstPath + "/*.png"], {
      destination: stagingDir + '/images',
      plugins: [
        imageminPngquant({
          quality: [0.1, 0.3]
        })
      ]
    })
}

async function stageTokenListsLogo(stagingDir, token) {
  const { address, logoURI } = token

  // NFTs do not have the logoURI field.
  if (!logoURI) {
    return ''
  }

  const isRemoteURL = logoURI.startsWith('https://') || logoURI.startsWith('http://')
  if (!isRemoteURL) {
    return logoURI
  }

  let extension = path.extname(logoURI.split('?')[0])
  if (extension === ".") {
    extension = ""
  }
  const sourceFile = `${address}${extension}`
  const destFile = `${address}.png`
  const sourceFilePath = path.join(os.tmpdir(), sourceFile)

  try {
    await util.download(logoURI, sourceFile)
  } catch (err) {
    console.log(err)
    return ''
  }

  // Add a delay to prevent coingecko asset CDN from forcing a JS security
  // challenge.
  await new Promise(r => setTimeout(r, 800))

  try {
    await util.saveToPNGResize(
      sourceFilePath,
      path.join(stagingDir, 'imagesUncompressed', destFile),
      false,
    )
  } catch {
    return ''
  }

  return destFile
}

async function stageTokenListsTokens(stagingDir, tokens, coingeckoIds, isEVM = true) {
  // Use an asynchronous job queue to throttle downloads.
  const q = new Qyu({concurrency: 2})
  q(tokens, async (token, idx) => {
    tokens[idx].logoURI = await stageTokenListsLogo(stagingDir, token)
  })

  await q.whenEmpty()
  return tokens
    .reduce((acc, token) => {
      const result = {
        name: token.name,
        logo: token.logoURI,
        erc20: isEVM,
        symbol: token.symbol,
        decimals: token.decimals,
        chainId: `0x${token.chainId.toString(16)}`
      }

      if (token.extensions && token.extensions.coingeckoId) {
        result.coingeckoId = token.extensions.coingeckoId
      }

      return {
        ...acc,
        [token.address]: result
      }
    }, {})
}

async function stageSPLTokens(stagingDir, coingeckoIds) {
  const tokenMap = JSON.parse(fs.readFileSync(path.join('data', 'solana', 'tokenlist.json')).toString())
  const splTokensArray = tokenMap.tokens
  const splTokens = await stageTokenListsTokens(stagingDir, splTokensArray, coingeckoIds, false)
  const splTokensWithCoingeckoIds = await util.injectCoingeckoIds(splTokens, coingeckoIds)
  const splTokensPath = path.join(stagingDir, 'solana-contract-map.json')
  fs.writeFileSync(splTokensPath, JSON.stringify(splTokensWithCoingeckoIds, null, 2))
}

async function stageDappLists(stagingDir) {
  const dappListsPath = path.join(stagingDir, 'dapp-lists.json')
  const dappLists = await util.generateDappLists()
  fs.writeFileSync(dappListsPath, JSON.stringify(dappLists, null, 2))
}

async function stageCoingeckoIds(stagingDir) {
  const dstPath = path.join(stagingDir, 'coingecko-ids.json')
  const coingeckoIds = await util.generateCoingeckoIds()
  await fsPromises.writeFile(dstPath, JSON.stringify(coingeckoIds, null, 2))
  return coingeckoIds
}

async function stageOnRampLists(stagingDir) {
  // The on-ramp-token-lists.json file is no longer used by the release version of the
  // browser.  It will be safe to remove in July, 2024.
  const srcOnRampTokensPath = path.join('data', 'onramps', 'on-ramp-token-lists.json');
  const dstOnRampTokensPath = path.join(stagingDir, 'on-ramp-token-lists.json');
  await fsPromises.copyFile(srcOnRampTokensPath, dstOnRampTokensPath);

  // The off-ramp-token-lists.json file is no longer used by the release version of the
  // browser.  It will be safe to remove in July, 2024.
  const srcOffRampTokensPath = path.join('data', 'onramps', 'off-ramp-token-lists.json');
  const dstOffRampTokensPath = path.join(stagingDir, 'off-ramp-token-lists.json');
  await fsPromises.copyFile(srcOffRampTokensPath, dstOffRampTokensPath);

  // ramp-tokens.json
  const srcRampTokensPath = path.join('data', 'onramps', 'ramp-tokens.json');
  const dstRampTokensPath = path.join(stagingDir, 'ramp-tokens.json');
  const srcRampTokensData = await fsPromises.readFile(srcRampTokensPath, 'utf-8');
  let rampTokens = JSON.parse(srcRampTokensData);
  rampTokens = await util.addSupportedCoinbaseTokens(rampTokens);
  await fsPromises.writeFile(dstRampTokensPath, JSON.stringify(rampTokens, null, 2));

  // on-ramp-currency-lists.json
  const srcOnRampCurrenciesPath = path.join('data', 'onramps', 'on-ramp-currency-lists.json');
  const dstOnRampCurrenciesPath = path.join(stagingDir, 'on-ramp-currency-lists.json');
  const srcOnRampCurrenciesData = await fsPromises.readFile(srcOnRampCurrenciesPath, 'utf-8');
  let onRampCurrencies = JSON.parse(srcOnRampCurrenciesData);
  onRampCurrencies = await util.addSupportedSardineCurrencies(onRampCurrencies);
  await fsPromises.writeFile(dstOnRampCurrenciesPath, JSON.stringify(onRampCurrencies, null, 2));
}

async function stageOFACLists(stagingDir) {
  const ofacLists = util.fetchGitHubRepoTopLevelFiles('brave-intl', 'ofac-sanctioned-digital-currency-addresses', 'lists');
  const dstOfacListsPath = path.join(stagingDir, 'ofac-sanctioned-digital-currency-addresses.json');
  await fsPromises.writeFile(dstOfacListsPath, JSON.stringify(ofacLists, null, 2));
}

async function stageTokenPackage() {
  const stagingDir = 'build'
  if (!fs.existsSync(stagingDir)) {
    fs.mkdirSync(stagingDir)
  }

  // Add coingecko-ids.json
  const coingeckoIds = await stageCoingeckoIds(stagingDir)

  const imagesDstPath = path.join(stagingDir, "imagesUncompressed")
  if (!fs.existsSync(imagesDstPath)){
    fs.mkdirSync(imagesDstPath)
  }

  // Add MetaMask tokens for contract-map.json
  const metamaskTokenPath = path.join('node_modules', '@metamask', 'contract-metadata', 'contract-map.json');
  await stageMainnetTokenFile(stagingDir, metamaskTokenPath, coingeckoIds)
  await stageEVMTokenImages(stagingDir, metamaskTokenPath)

  // Add Brave specific tokens in evm-contract-map.json
  const braveTokenPath = path.join('data', 'evm-contract-map', 'evm-contract-map.json');
  await stageEVMTokenFile(stagingDir, braveTokenPath, coingeckoIds)
  await stageEVMTokenImages(stagingDir, braveTokenPath, coingeckoIds)

  // Add Solana (SPL) tokens in solana-contract-map.json.
  await stageSPLTokens(stagingDir, coingeckoIds)
  await compressPng(imagesDstPath, stagingDir)
  fs.rmSync(imagesDstPath, { recursive: true, force: true });

  // Add chainlist.json.
  await stageChainListJson(stagingDir)

  // Add dapp-lists.json.
  await stageDappLists(stagingDir)

  // Add on ramp JSON files
  await stageOnRampLists(stagingDir)

  // Add OFAC banned address lists
  await stageOFACLists(stagingDir)

  stagePackageJson(stagingDir)
  stageManifest(stagingDir)
}

util.installErrorHandlers();
stageTokenPackage()
