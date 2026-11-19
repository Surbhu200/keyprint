# Keyprint Contracts (Arc Testnet)

Run all Foundry commands from **Git Bash** or **WSL** (not PowerShell).

## One-time Foundry setup (Git Bash)

```bash
curl -L https://foundry.paradigm.xyz | bash
export PATH="$HOME/.foundry/bin:$PATH"
foundryup
```

## Install dependencies

```bash
cd contracts
forge install foundry-rs/forge-std --no-git
forge install OpenZeppelin/openzeppelin-contracts --no-git
```

## Build & test

```bash
cd contracts
forge build && forge test -vv
```
