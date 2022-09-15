const childProcess = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')
const sharp = require('sharp')
const Downloader = require('nodejs-file-downloader')

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

const contractAddExtraAssetIcons = (file, imagesDstPath) => {
  const data = JSON.parse(fs.readFileSync(file))
  // CRV
  data["0xD533a949740bb3306d119CC777fa900bA034cd52"] = {
    name: "Curve",
    logo: "curve.png",
    erc20: true,
    symbol: "CRV",
    decimals: 18
  }
  // PDAI
  data["0x9043d4d51C9d2e31e3F169de4551E416970c27Ef"] = {
    name: "Palm DAI",
    logo: "pdai.png",
    erc20: true,
    symbol: "PDAI",
    decimals: 18
  }
  // Just copy ETH icon as ETH is not a contract token
  fs.writeFileSync(file, JSON.stringify(data, null, 2))
}

async function saveToPNGResize(source, dest, ignoreError) {
  return new Promise(function (resolve, reject) {
    sharp(source)
      .png()
      .toFile(dest)
      .then(function(info) {
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
            .then(function(info) {
              resolve()
            })
            .catch(function(err) {
              console.log('source == ' + source + ' ' + err)
              reject()
            })
        } else {
          if ((info.width < 200 || info.height < 200) && !source.endsWith(".png"))  {
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
      .catch(function(err) {
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

async function download (url, dest) {
  console.log(`download: ${url}`)
  const downloader = new Downloader({
    url,
    directory: os.tmpdir(),
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

module.exports = {
  contractReplaceSvgToPng,
  contractAddExtraAssetIcons,
  installErrorHandlers,
  saveToPNGResize,
  download
}
