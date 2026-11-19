# Keyprint

**Your apartment. Its history. Your proof.**

Keyprint is a renter-owned, tamper-evident 3D record of an apartment paired with a rule-enforced USDC security-deposit escrow on Arc Testnet. Built for the **UBC 2026 Hackathon** (**Main Track:** Consumer Applications · **Chain Award:** Best use of Arc).

- **Live Demo:** [https://keyprint-two.vercel.app](https://keyprint-two.vercel.app)
- **Demo Video (2–3 min):** _Add unlisted YouTube / Google Drive link here_

---

## Try It in Two Minutes

1. Open **`/sample`** in an incognito window to explore a 3D apartment with move-in pins, the before/after time slider, AI suggestions, and the `$40` / `$160` split.
2. Download both sample `.glb` files (original + 1-byte-changed copy) and drop them into **`/verify`**.
3. Open **`/unit/new`** to seal a 3D scan and spatial pins in **Solo mode** with your own passkey (no landlord and no deposit required).

---

## The Problem and the Flip

| | Today | With Keyprint |
| --- | --- | --- |
| **Who holds the deposit** | The landlord | An ownerless escrow contract on Arc that neither side controls |
| **Who holds the evidence** | The landlord's phone | Both sides; each file's fingerprint is sealed on Arc the moment it's added, and the landlord co-signs or contests it |
| **Who has to prove damage** | The renter must prove they didn't do it | The landlord must pin each claim to a spot in the 3D record and price it |
| **If nobody does anything** | The landlord keeps the money | Once the deadline passes, the full deposit goes back to the renter: Keyprint's keeper triggers it, and anyone can |

---

## Architecture (3 Layers)

```mermaid
flowchart LR
  subgraph Client["Browser / Installable PWA (Windows & iPhone)"]
    UI["Next.js App Router + R3F 3D Engine\n(Umeyama + three-mesh-bvh + Scissor Slider)"]
    HASH["hash-wasm SHA-256 + RFC 8785 Manifest"]
    PASSKEY["Circle Modular Wallets\n(Face ID / Windows Hello, paymaster: true)"]
    UI --> HASH --> PASSKEY
  end

  subgraph Chain["Arc Testnet (Chain ID 5042002 · USDC Gas)"]
    REG["KeyprintRegistry\n(Fingerprints, Co-signs, Contests)"]
    ESC["KeyprintEscrow\n(Ownerless 6-dec USDC Escrow + owed[])"]
    PASSKEY -->|"Batched Sponsored UserOps"| REG
    PASSKEY -->|"approve + fund / claim / settle"| ESC
  end

  subgraph Server["Vercel Serverless + Supabase Private Storage"]
    SUPA["Supabase Private Bucket (50 MB)\n+ Postgres Metadata Index"]
    CLAUDE["/api/analyze\nClaude Opus 5.5 Structured Diff"]
    KEEPER["/api/keeper/settle\nDeadline Keeper + Daily Cron"]
    UI -->|"Direct Signed PUT/GET"| SUPA
    UI -->|"Viewpoint Paths"| CLAUDE
    KEEPER -->|"simulateContract + settle()"| ESC
  end
```

1. **Browser (Next.js App Router + React Three Fiber + three-mesh-bvh + hash-wasm):**
   - Hashes `.glb` scans and photos in streaming chunks (`hash-wasm`), canonicalizes manifests per RFC 8785 (`canonicalize`), and signs gas-sponsored ERC-4337 UserOperations with passkeys via Circle Modular Wallets.
   - Aligns move-out scans to move-in coordinates using the Umeyama similarity transform (`ml-matrix`) and gates comparisons on surface agreement (`three-mesh-bvh`, median gap `< 2 cm` and `>= 60%` within `5 cm`).
   - Renders matching 1024×768 4:3 before/after pairs offscreen and matches AI suggestions to move-in pins strictly in geometric code.
2. **Arc Testnet (Chain ID `5042002`):**
   - `KeyprintRegistry`: ownerless, immutable onchain registry storing manifest SHA-256 hashes, timestamps, monotonic seal sequence numbers, and per-account `acknowledgedAt` co-signs.
   - `KeyprintEscrow`: ownerless, non-upgradeable 6-decimal ERC-20 USDC (`0x3600000000000000000000000000000000000000`) escrow enforcing lease terms, evidence checks, claim windows, two-sided silence rules, reviewer dispute resolution, permissionless settlement, and non-blocking `owed[]` payouts.
3. **Private Storage & Server Routes (Supabase + Vercel):**
   - 3D scans and photos live in a **private** Supabase Storage bucket (`keyprint-private`) uploaded directly from the browser via short-lived signed URLs (never public IPFS, never routed through Vercel's 4.5 MB limit).
   - `/api/analyze` runs **Claude Opus 5.5** (`claude-opus-5-5`, `client.messages.parse` + `zodOutputFormat`) server-side with caching keyed by record IDs + view IDs + prompt version.
   - `/api/keeper/settle` simulates and triggers permissionless `settle(leaseId)` once deadlines expire (backed by a daily Vercel Cron job).

---

## How Keyprint Uses Arc & Circle

- **Circle Modular Wallets (`@circle-fin/modular-wallets-core` + `viem`):** Passkey-controlled smart accounts (`toPasskeyTransport`, `toWebAuthnCredential`, `toModularTransport(${clientUrl}/arcTestnet)`, `toCircleSmartAccount`) so renters sign in with Face ID or Windows Hello—never seeing seed phrases or `0x` strings on main screens.
- **Gas Station Sponsorship (`paymaster: true`):** Every seal, co-sign, priced-pin claim, dispute, withdrawal, and settlement runs as a batched, gas-sponsored UserOperation on Arc Testnet.
- **USDC Native & ERC-20 Model:** Deposits and payouts use the 6-decimal ERC-20 interface (`0x3600000000000000000000000000000000000000`), while Arc gas is metered in 18-decimal native USDC (measured from `actualGasCost` on UserOp receipts and never mixed with deposit units).

### Arc Testnet Contracts

| Contract | Address | Explorer |
| --- | --- | --- |
| USDC (ERC-20 interface, 6 decimals) | `0x3600000000000000000000000000000000000000` | [Arc Testnet Explorer](https://explorer.testnet.arc.io/address/0x3600000000000000000000000000000000000000) |
| `KeyprintRegistry` | `0x57cF232F1e0c250d6bcA49Af6461ee477f450341` | [Arc Testnet Explorer](https://explorer.testnet.arc.io/address/0x57cF232F1e0c250d6bcA49Af6461ee477f450341) |
| `KeyprintEscrow` (`MIN_WINDOW = 60s`) | `0x97d85aC09C01ed2dBf2611b7B91fF4BB2A69654a` | [Arc Testnet Explorer](https://explorer.testnet.arc.io/address/0x97d85aC09C01ed2dBf2611b7B91fF4BB2A69654a) |

### Full Live Lease on Arc Testnet & Measured USDC Gas Cost

An entire lease lifecycle on Arc Testnet (**12 transactions**: create, seal move-in, approve, fund, co-sign, seal move-out, end lease, seal claim evidence, file claim, close claims, accept, settle) cost **$0.032331 USDC** total in measured native gas fees:

- **Lease ID:** `0x03233ed03704723f17cc7625d024bf316f17f7ae0e6685524c3205522bd8d9ed`
- **Co-Signed Move-In Record ID (verifiable live at `/verify`):** `0x92934d0e9167e77d31d663c933fe3e08569c1b0a00592763d740513adbc077d2`

| Step | Block | Gas Fee (USDC) | Explorer |
| --- | --- | --- | --- |
| `createLease` | `72,981,949` | `$0.005127` | [View tx](https://explorer.testnet.arc.io/tx/0xf85d2a1f6f6fc2acf08f708492c519a98f444da68f5cdc07f1ca8510ea3f93ec) |
| `seal(MoveInScan)` | `72,981,958` | `$0.003045` | [View tx](https://explorer.testnet.arc.io/tx/0x4cc6f20dd02e0e2291b7583133571ac0d5f42e446d90922a17ba4adb650084ac) |
| `USDC.approve(2 USDC)` | `72,981,967` | `$0.001164` | [View tx](https://explorer.testnet.arc.io/tx/0x5468c776e0fa1f50df131f9bec217311d58a1cdb93f4739aeddf09bafc230615) |
| `fund(2 USDC)` | `72,981,975` | `$0.003268` | [View tx](https://explorer.testnet.arc.io/tx/0x71ebafb4dbfbb1f49161d1e342a9351973977a2e28ae5f51362a3a9448fd0965) |
| `acknowledge` (landlord co-sign) | `72,981,984` | `$0.001016` | [View tx](https://explorer.testnet.arc.io/tx/0xfbc76e7f8f91200478277ff2375c6c4eefc275c5740cef418df743027c2043fd) |
| `seal(MoveOutScan)` | `72,981,986` | `$0.003463` | [View tx](https://explorer.testnet.arc.io/tx/0xa324e123adc0a3e9a4ba68b466741e65229515aafd1fa871ef1d7ddccc66a003) |
| `endLease` | `72,981,994` | `$0.001776` | [View tx](https://explorer.testnet.arc.io/tx/0x081fd7949c97669411e429615ba8fa7ae2f803064925c96ddbcc7461656059a1) |
| `seal(ClaimEvidence)` | `72,982,003` | `$0.003463` | [View tx](https://explorer.testnet.arc.io/tx/0xfae175d9054cd7bdf3219cee524ec8995b132b19120c6ebe0dcbe3c39599b7fd) |
| `fileClaim(1 USDC)` | `72,982,012` | `$0.005821` | [View tx](https://explorer.testnet.arc.io/tx/0xb4c877636527224b16a0f080f51514ec36f5237fe4500d8856e4df7a27f874c3) |
| `closeClaims` | `72,982,020` | `$0.000692` | [View tx](https://explorer.testnet.arc.io/tx/0x37cdb83a4cf4edacd8f322f312ed9c8f43d99cb883ecf9dd12ca92faaa14e861) |
| `acceptClaim` | `72,982,029` | `$0.000944` | [View tx](https://explorer.testnet.arc.io/tx/0x8a9bc16e9b6e1539dc64cfc236ac21603ff0db8e4ac31848e225b4e1dd837b1c) |
| `settle` (`$1` landlord / `$1` renter) | `72,982,031` | `$0.002553` | [View tx](https://explorer.testnet.arc.io/tx/0xffb9426eff0107dd66e232444ff120f59fefd7eb9dce9e20ae519369376dcfc7) |

---

## Escrow Design & Risk Assumptions

- **No admin key, no pause, no proxy:** Nobody, Keyprint included, can freeze or redirect escrowed deposits.
- **Evidence checks:** `fund` requires a renter-sealed `MoveInScan` for that lease; `endLease` requires a post-funding `MoveOutScan` on or after `leaseEnd`; `fileClaim` requires a fresh, post-move-out landlord-sealed `ClaimEvidence` record (`>= 1 USDC`, max 20 claims, non-withdrawn total `<= deposit`).
- **Silence both ways:** An unanswered claim counts as accepted after `responseWindow`; an unresolved dispute counts as `$0` (returned to renter) after `resolveWindow`. Both defaults are disclosed on the terms card before the renter pays.
- **Non-blocking settlement (`owed[]`):** If USDC's issuer blocklists a recipient and a transfer fails during `settle()`, the failed amount is credited to `owed[address]` for `withdraw()` so one party can never freeze the other's payout.
- **Permissionless settlement:** Contracts do not self-execute; once the rules allow settlement, Keyprint's keeper calls `settle()`, the renter has a one-tap *"Release my deposit"* fallback, and any external account can trigger it.

---

## Local Setup & Deployment

### Prerequisites

- Node.js `22+`
- Foundry (run in **Git Bash** or **WSL** on Windows — see `contracts/README.md`)
- Circle Developer Console account (Client Key + Passkey Domain for `localhost` and your Vercel production domain)
- Supabase project (run `supabase/schema.sql` in SQL Editor)
- Anthropic API key (`ANTHROPIC_API_KEY`)

### 1. Install & Test Web App

```bash
cp .env.example .env.local
npm install
npm test
npm run dev
```

### 2. Build, Test & Deploy Contracts (Git Bash / WSL)

```bash
cd contracts
forge build && forge test -vv

# Deploy to Arc Testnet (MIN_WINDOW = 60 seconds for demo)
forge create src/KeyprintRegistry.sol:KeyprintRegistry \
  --rpc-url "$ARC_RPC" --private-key "$DEPLOYER_KEY" --broadcast

forge create src/KeyprintEscrow.sol:KeyprintEscrow \
  --rpc-url "$ARC_RPC" --private-key "$DEPLOYER_KEY" --broadcast \
  --constructor-args 0x3600000000000000000000000000000000000000 "$REGISTRY_ADDRESS" 60
```

---

## What I Built vs. Used & Honest Limitations

- **Built:** `KeyprintRegistry` and `KeyprintEscrow` smart contracts + full Foundry adversarial/fuzz/invariant suite, RFC 8785 manifest sealing & client-side `/verify`, 4-point Umeyama alignment + `three-mesh-bvh` surface agreement gate, dual-pass scissor time slider, offscreen 4:3 rendering + Claude Vision structured diff + geometric pin matching, settlement keeper, and all consumer screens.
- **Used:** Scaniverse/Polycam for 3D reconstruction (with Three.js's open-source `minimalistic_modern_bedroom.glb` interior scene prepared as the built-in metric reference move-in/move-out pair until replaced with live iPhone Pro LiDAR scans), Circle Modular Wallets + Gas Station on Arc, Supabase private Storage/Postgres, and Claude Opus 5.5.
- **Honest limitations:** 3D reconstruction comes from an external scanning app (in-app capture with device attestation is next); the move-in review window, alignment gate, and priced-pin schema are enforced by the app while the contract enforces evidence existence, authorship, ordering, deadlines, and payouts; settlement requires a trigger (Keyprint's keeper or any caller); real production deployment requires state-by-state legal review of deposit custody and silence defaults.
