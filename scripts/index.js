const fs = require('fs')
const path = require('path')
const util = require('./util')

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

function stageManifest(stagingDir) {
  const manifestPath = path.join('data', 'manifest.json');
  const outputManifestPath = path.join(stagingDir, 'manifest.json');
  fs.copyFileSync(manifestPath, outputManifestPath)
}

async function stageTokenImages(stagingDir, inputTokenFilePath, addExtraTokens = false) {
  const outputTokenFilePath = getOutputTokenPath(stagingDir, inputTokenFilePath);
  const baseSrcTokenPath = path.dirname(inputTokenFilePath)
  // Copy images and convert them to png plus resize to 200x200 if needed
  const imagesSrcPath = path.join(baseSrcTokenPath, "images")
  const imagesDstPath = path.join(stagingDir, "images")
  const files = fs.readdirSync(imagesSrcPath)
  if (!fs.existsSync(imagesDstPath)){
    fs.mkdirSync(imagesDstPath)
  }
  for (var i = 0; i < files.length; i++) {
    var file = files[i]
    var fileTo = file.substr(0, file.lastIndexOf(".")) + ".png"
    var fromPath = path.join(imagesSrcPath, file)
    var toPath = path.join(imagesDstPath, fileTo)
    await util.saveToPNGResize(fromPath, toPath, false)
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

async function stageTokenPackage() {
  const stagingDir = 'build'
  if (!fs.existsSync(stagingDir)) {
    fs.mkdirSync(stagingDir)
  }

  // Add MetaMask tokens for contract-map.json
  const metamaskTokenPath = path.join('node_modules', '@metamask', 'contract-metadata', 'contract-map.json');
  stageTokenFile(stagingDir, metamaskTokenPath)
  await stageTokenImages(stagingDir, metamaskTokenPath, true)

  // Add Brave specific tokens in evm-contract-map.json
  const braveTokenPath = path.join('data', 'evm-contract-map', 'evm-contract-map.json');
  stageTokenFile(stagingDir, braveTokenPath)
  await stageTokenImages(stagingDir, braveTokenPath)

  stagePackageJson(stagingDir)
  stageManifest(stagingDir)
}

util.installErrorHandlers();
stageTokenPackage()
