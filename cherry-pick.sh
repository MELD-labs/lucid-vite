#!/bin/bash

git reset --hard fork/fork-base
git cherry-pick fork/fork-base..fork/blueprint
git cherry-pick fork/fork-base..fork/wallet-from-seed-utxos
git cherry-pick fork/fork-base..fork/native-script
deno task pack
git add .
git commit -m "Rebuild artifact"
