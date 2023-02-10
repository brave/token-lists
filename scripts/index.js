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

function stageTokenFile(stagingDir, inputTokenFilePath) {
  fs.copyFileSync(inputTokenFilePath, getOutputTokenPath(stagingDir, inputTokenFilePath))
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
  const srcPath = path.join('data', 'chainlist', 'chainlist.json')
  const dstPath = path.join(stagingDir, 'chainlist.json')
  fsPromises.copyFile(srcPath, dstPath)
}

function stageManifest(stagingDir) {
  const manifestPath = path.join('data', 'manifest.json');
  const outputManifestPath = path.join(stagingDir, 'manifest.json');
  fs.copyFileSync(manifestPath, outputManifestPath)
}

async function stageEVMTokenImages(stagingDir, inputTokenFilePath, addExtraTokens = false) {
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
    try {
      await util.saveToPNGResize(fromPath, toPath, false)
    } catch (e) {
      console.log(`Failed to resize: ${fromPath}`)
    }
  }
  util.contractReplaceSvgToPng(outputTokenFilePath)
  // We can remove this later if we migrate the tokens to
  // the evm-contract-map.json.
  // We can't do this yet because we need
  // to supporpt old builds that are using the token file.
  // This can be done after April 2022.
  if (addExtraTokens) {
    util.contractAddExtraAssetIcons(outputTokenFilePath, imagesDstPath)
  }
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

  const extension = path.extname(logoURI.split('?')[0])
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

async function stageTokenListsTokens(stagingDir, tokens, isEVM = true) {
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

async function stageSPLTokens(stagingDir) {
  const tokenMap = JSON.parse(fs.readFileSync(path.join('data', 'solana', 'tokenlist.json')).toString())
  const splTokensArray = tokenMap.tokens
  const splTokens = await stageTokenListsTokens(stagingDir, splTokensArray, false)
  const splTokensPath = path.join(stagingDir, 'solana-contract-map.json')
  fs.writeFileSync(splTokensPath, JSON.stringify(splTokens, null, 2))
}

async function stageTokenPackage() {
  const stagingDir = 'build'
  if (!fs.existsSync(stagingDir)) {
    fs.mkdirSync(stagingDir)
  }

  const imagesDstPath = path.join(stagingDir, "imagesUncompressed")
  if (!fs.existsSync(imagesDstPath)){
    fs.mkdirSync(imagesDstPath)
  }

  // Add MetaMask tokens for contract-map.json
  const metamaskTokenPath = path.join('node_modules', '@metamask', 'contract-metadata', 'contract-map.json');
  stageTokenFile(stagingDir, metamaskTokenPath)
  await stageEVMTokenImages(stagingDir, metamaskTokenPath, true)

  // Add Brave specific tokens in evm-contract-map.json
  const braveTokenPath = path.join('data', 'evm-contract-map', 'evm-contract-map.json');
  stageTokenFile(stagingDir, braveTokenPath)
  await stageEVMTokenImages(stagingDir, braveTokenPath)

  // Add Solana (SPL) tokens in solana-contract-map.json.
  await stageSPLTokens(stagingDir)
  await compressPng(imagesDstPath, stagingDir)
  fs.rmSync(imagesDstPath, { recursive: true, force: true });

  // Add chainlist.json.
  await stageChainListJson(stagingDir)

  stagePackageJson(stagingDir)
  stageManifest(stagingDir)
}

util.installErrorHandlers();
stageTokenPackage()
