#!/usr/bin/env bash
# 1-command Keyprint smart contract deployment to Arc Testnet (run in Git Bash or WSL).
set -euo pipefail

export PATH="$HOME/.foundry/bin:$PATH"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT_DIR/.env.local"

if [ ! -f "$ENV_FILE" ]; then
  echo "ERROR: .env.local not found at $ENV_FILE"
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

ARC_RPC="${ARC_RPC:-https://rpc.testnet.arc.io}"
ARC_USDC="0x3600000000000000000000000000000000000000"
MIN_WINDOW="${MIN_WINDOW:-60}"

if [ -z "${DEPLOYER_KEY:-}" ]; then
  echo "ERROR: DEPLOYER_KEY is empty in .env.local"
  exit 1
fi

DEPLOYER_ADDR="$(cast wallet address --private-key "$DEPLOYER_KEY")"
BAL_WEI="$(cast balance "$DEPLOYER_ADDR" --rpc-url "$ARC_RPC")"
echo "Deployer address: $DEPLOYER_ADDR"
echo "Arc native USDC balance (18 dec): $BAL_WEI"

if [ "$BAL_WEI" = "0" ]; then
  echo ""
  echo "ERROR: Deployer has 0 Arc Testnet USDC for gas."
  echo "Fund this address once at https://faucet.circle.com (select Arc Testnet):"
  echo "  $DEPLOYER_ADDR"
  exit 1
fi

cd "$ROOT_DIR/contracts"
echo ""
echo "==> Running Foundry build & full test suite..."
forge build --no-lint
forge test -vv

echo ""
echo "==> Deploying KeyprintRegistry to Arc Testnet..."
REG_OUT="$(forge create src/KeyprintRegistry.sol:KeyprintRegistry \
  --rpc-url "$ARC_RPC" \
  --private-key "$DEPLOYER_KEY" \
  --broadcast)"
echo "$REG_OUT"
REGISTRY_ADDRESS="$(echo "$REG_OUT" | awk '/Deployed to:/ {print $3}')"

if [ -z "$REGISTRY_ADDRESS" ]; then
  echo "ERROR: Could not parse KeyprintRegistry deployed address."
  exit 1
fi

echo ""
echo "==> Deploying KeyprintEscrow (MIN_WINDOW=${MIN_WINDOW}s) to Arc Testnet..."
ESC_OUT="$(forge create src/KeyprintEscrow.sol:KeyprintEscrow \
  --rpc-url "$ARC_RPC" \
  --private-key "$DEPLOYER_KEY" \
  --broadcast \
  --constructor-args "$ARC_USDC" "$REGISTRY_ADDRESS" "$MIN_WINDOW")"
echo "$ESC_OUT"
ESCROW_ADDRESS="$(echo "$ESC_OUT" | awk '/Deployed to:/ {print $3}')"

if [ -z "$ESCROW_ADDRESS" ]; then
  echo "ERROR: Could not parse KeyprintEscrow deployed address."
  exit 1
fi

# Update .env.local cleanly in place
node -e "
const fs = require('fs');
const p = process.argv[1];
let s = fs.readFileSync(p, 'utf8');
for (const [k, v] of [
  ['NEXT_PUBLIC_KEYPRINT_REGISTRY_ADDRESS', process.argv[2]],
  ['NEXT_PUBLIC_KEYPRINT_ESCROW_ADDRESS', process.argv[3]],
]) {
  const re = new RegExp('^' + k + '=.*$', 'm');
  s = re.test(s) ? s.replace(re, k + '=' + v) : s + '\n' + k + '=' + v;
}
fs.writeFileSync(p, s, 'utf8');
" "$ENV_FILE" "$REGISTRY_ADDRESS" "$ESCROW_ADDRESS"

echo ""
echo "=================================================================="
echo "Keyprint deployed to Arc Testnet!"
echo "  KeyprintRegistry: $REGISTRY_ADDRESS"
echo "    https://explorer.testnet.arc.io/address/$REGISTRY_ADDRESS"
echo "  KeyprintEscrow:   $ESCROW_ADDRESS"
echo "    https://explorer.testnet.arc.io/address/$ESCROW_ADDRESS"
echo ""
echo "Updated .env.local automatically."
echo "Next: add both addresses to Vercel Env Vars (or ask Cursor to push them)."
echo "=================================================================="
