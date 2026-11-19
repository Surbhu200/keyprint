# Keyprint

**Your apartment. Its history. Your proof.**

Keyprint is a renter-owned, tamper-evident 3D record of an apartment paired with a rule-enforced USDC security-deposit escrow on Arc Testnet. Built for the UBC 2026 Hackathon (Consumer Applications track · Best use of Arc).

## Stack

- **Frontend:** Next.js (App Router, TypeScript), Tailwind CSS, shadcn/ui, Framer Motion, React Three Fiber + drei, `three-mesh-bvh`, `ml-matrix`
- **Chain:** Solidity + Foundry + OpenZeppelin on Arc Testnet (`chainId: 5042002`), `viem`, Circle Modular Wallets (`@circle-fin/modular-wallets-core`) with passkeys and Gas Station sponsorship (`paymaster: true`)
- **Backend & Storage:** Next.js Route Handlers on Vercel, Supabase Postgres & private Storage
- **AI:** Anthropic TypeScript SDK (`claude-opus-5-5`, structured outputs via `zodOutputFormat`, server-side only)

## Local Setup

1. Install Node.js 22+ and copy the environment template:
   ```bash
   cp .env.example .env.local
   ```
2. Install web dependencies and run the dev server:
   ```bash
   npm install
   npm run dev
   ```
3. Smart contracts live in `contracts/` (run Foundry commands in Git Bash or WSL; see `contracts/README.md`).

## Contracts on Arc Testnet

*Contract addresses, explorer links, and measured USDC gas costs will be added upon deployment.*

| Contract | Address | Explorer |
| --- | --- | --- |
| USDC (ERC-20 interface, 6 decimals) | `0x3600000000000000000000000000000000000000` | [Arc Testnet Explorer](https://explorer.testnet.arc.io/address/0x3600000000000000000000000000000000000000) |
| `KeyprintRegistry` | *Pending deploy* | — |
| `KeyprintEscrow` | *Pending deploy* | — |

## Specification

Full product, architecture, and demo specification lives in [`docs/BUILD.md`](docs/BUILD.md).
