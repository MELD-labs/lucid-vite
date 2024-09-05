#!/bin/bash

git reset --hard fork/fork-base
git cherry-pick fork/fork-base..fork/blueprint
git cherry-pick fork/fork-base..fork/wallet-from-seed-utxos
git cherry-pick fork/fork-base..fork/native-script

deno task build
rm -rf browser artifacts
mkdir -p browser/web browser/esm/src/core/libs/cardano_message_signing browser/esm/src/core/libs/cardano_multiplatform_lib
jq '.module = "./web/mod.js"' package.json >browser/package.json
cp dist/web/mod.js browser/web/mod.js
cp dist/esm/src/core/libs/cardano_message_signing/*.* browser/esm/src/core/libs/cardano_message_signing
cp dist/esm/src/core/libs/cardano_multiplatform_lib/*.* browser/esm/src/core/libs/cardano_multiplatform_lib

mkdir -p artifacts/node artifacts/browser
npm pack --pack-destination ./artifacts/node ./dist
npm pack --pack-destination ./artifacts/browser ./browser

git add ./artifacts
git commit -m "Rebuild artifact"
