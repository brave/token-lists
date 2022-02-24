# token-lists

Manages custom token lists for Brave Wallet

## Development

To test out the output of this package run:

```js
npm start
```

## Publishing token list to npm

[brave/brave-core-crx-pacager](https://github.com/brave/brave-core-crx-packager) uses the npm package published [here brave-wallet-lists](https://www.npmjs.com/package/brave-wallet-lists).

To publish a new package run:

```js
npm start
npm run publish-token-package
```

This outputs a no dependency package with output images and token lists.

## Testing a deployment

You can test a deployment by running the Jenkins job named:
`brave-core-ext-local-data-files-update-publish-dev`

Then startup Brave using:
`open -a Brave\ Browser\ Beta.app --args --use-dev-goupdater-url --user-data-dir=$(mktemp -d)`

After things are tested you can run the Jenkins job: `brave-core-ext-local-data-files-update-publish` and then test on your normal Brave profile.
The change will be live. Please also test on production.
