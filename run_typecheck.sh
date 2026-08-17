#!/usr/bin/env bash
cd /home/david/DMuster
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
node ./node_modules/typescript/bin/tsc --noEmit
echo "TSC_EXIT=$?"
node ./node_modules/eslint/bin/eslint.js src
echo "LINT_EXIT=$?"
node ./node_modules/.bin/jest
echo "TEST_EXIT=$?"
