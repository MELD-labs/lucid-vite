#!/bin/bash

git reset --hard fork/fork-base
git cherry-pick fork/fork-base..fork/blueprint
git cherry-pick fork/fork-base..fork/wallet-from-seed-utxos
git cherry-pick fork/fork-base..fork/native-script

deno task build

rm -rf browser artifacts
mkdir -p artifacts/node artifacts/browser

cp -r dist/ browser/
jq -s '.[0] * .[1]' package.json browser.package.json >browser/package.json

npm pack --pack-destination ./artifacts/node ./dist
npm pack --pack-destination ./artifacts/browser ./browser

git add ./artifacts
git commit -m "Rebuild artifact"
