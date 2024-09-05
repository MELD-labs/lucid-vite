#!/bin/bash

git reset --hard fork/fork-base
git cherry-pick fork/fork-base..fork/blueprint
git cherry-pick fork/fork-base..fork/wallet-from-seed-utxos
git cherry-pick fork/fork-base..fork/native-script

deno task build

rm -rf browser artifacts
mkdir -p browser/web artifacts/node artifacts/browser

jq '.module = "./web/mod.js" | .types = "./esm/mod.d.ts"' package.json >browser/package.json
cp dist/web/mod.js browser/web/mod.js
cp -r dist/esm browser/esm

npm pack --pack-destination ./artifacts/node ./dist
npm pack --pack-destination ./artifacts/browser ./browser

git add ./artifacts
git commit -m "Rebuild artifact"
