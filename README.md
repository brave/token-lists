# token-lists

Manages custom token lists for Brave Wallet

## Automated Publishing

We have the following setup in place to automatically build and publish
token-lists to wallet data files.

1. A **daily** cron job on [GitHub Actions](https://github.com/brave/token-lists/blob/main/.github/workflows/solana-tokenlist.yml) that performs the following tasks:
   1. use `@solflare-wallet/utl-aggregator` to fetch the top SPL tokens on CoinGecko.
   2. commit the above list to `data/solana/tokenlist.json`.
   3. download and post-process token logos, and build a new NPM package.
   4. publish the above NPM package.
2. A **weekly** cron job on [Jenkins](https://github.com/brave/devops/blob/master/jenkins/jobs/extensions/brave-core-ext-wallet-data-files-update-publish.yml) that publishes the latest NPM package
  (in 1.iv) to wallet data files.

The purpose of 2 independent cron jobs is to factor in flakiness of 1., and
avoid performing PNG post-processing in 2.

## Development

To test out the output of this package you have to use a docker. It has been
tested on Linux and macOS:

- Install [docker](https://runnable.com/docker/)
- Create a docker image `docker build -t token-lists .`
- Launch the docker image `docker run -u "$(id -u):$(id -g)" -v "$PWD/build:/token-lists/build" -ti token-lists`
- You will see an output in the `build` folder

## Publishing token list to npm

[brave/brave-core-crx-packager](https://github.com/brave/brave-core-crx-packager) uses the npm package published [here brave-wallet-lists](https://www.npmjs.com/package/brave-wallet-lists).

It will be automatically published when your PR is merged and release is created.

This outputs a no dependency package with output images and token lists.

## Testing a deployment

To test wallet data files use the development component updater with a fresh profile.

To do this you can use the command line argument `--use-dev-goupdater-url`.

You can use a clean profile without clearing with this as well: `--user-data-dir=<tmp-dir>`.

If you're using a development build, you can set the dev server via this npmrc environment in `~/.npmrc`:

`updater_dev_endpoint=https://go-updater-dev.bravesoftware.com/extensions`

You can test a deployment by running the Jenkins job named:
`brave-core-ext-wallet-data-files-update-publish-dev`
Please check to make sure it succeeds.

Wait 5-10 minutes as the server will purge its cache during that timeframe and start serving the new component.

Then startup Brave using:
`open -a Brave\ Browser\ Beta.app --args --use-dev-goupdater-url --user-data-dir=$(mktemp -d)`

After things are tested you can run the Jenkins job: `brave-core-ext-wallet-data-files-update-publish` and then after success, test on your normal Brave profile.
The change will be live within 5-10 minutes. Please also test on production.

After testing on production, gives sign off in Slack on `#releases` and `#prod-changes`.

## Troubleshooting deployment

You can see a list of the components that the component updater serves by going to these URLs:

- Prod: https://go-updater.brave.com/extensions/test
- Dev: https://go-updater-dev.bravesoftware.com/extensions/test

