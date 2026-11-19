# Keyprint — UBC 2026 Devpost Submission Kit

**Submission Deadline:** Friday, Nov 20, 2026 @ 12:00 PM CST  
**Submission Portal:** [ubc-hackathon-2026.devpost.com](https://ubc-hackathon-2026.devpost.com)

## Track & Awards Selection
- **Main Track (Required — pick 1):** `Consumer Applications`
- **Chain Award (Optional — pick 1):** `Best use of Arc`
- **Bounties:** None *(per strategy in `docs/BUILD.md`: focus cleanly on Consumer + Arc + Overall UBC Winner)*

## Links to Paste on Devpost
- **Live Deployed App (Installable PWA + Web):** [https://keyprint-two.vercel.app](https://keyprint-two.vercel.app)
- **Public GitHub Repo:** [https://github.com/Surbhu200/keyprint](https://github.com/Surbhu200/keyprint)
- **KeyprintRegistry (Arc Testnet):** [https://explorer.testnet.arc.io/address/0x57cF232F1e0c250d6bcA49Af6461ee477f450341](https://explorer.testnet.arc.io/address/0x57cF232F1e0c250d6bcA49Af6461ee477f450341)
- **KeyprintEscrow (Arc Testnet):** [https://explorer.testnet.arc.io/address/0x97d85aC09C01ed2dBf2611b7B91fF4BB2A69654a](https://explorer.testnet.arc.io/address/0x97d85aC09C01ed2dBf2611b7B91fF4BB2A69654a)
- **Demo Video (2–3 min, unlisted YouTube / Drive):** _Paste link after recording Friday morning_

---

## Copy-Paste Written Answers

### 1. What did you build?
Keyprint is a renter-owned, tamper-evident 3D record of an apartment paired with an ownerless USDC security-deposit escrow on Arc Testnet. Renters load a 3D scan of their apartment at move-in, pin pre-existing damage in 3D, and seal the record with a single passkey touch (Face ID or Windows Hello) while locking their deposit in escrow. At move-out, a second scan is aligned in 4 taps (Umeyama similarity transform + `three-mesh-bvh` surface-agreement gate), compared with a real-time before-and-after 3D time slider, and reviewed with AI-suggested changes matched against move-in pins strictly in geometric code. To keep a single dollar, the landlord must pin and price each claim to an exact spot in the 3D record. Once every claim is final, one settlement pays both sides in USDC—and if the landlord files nothing by the deadline, Keyprint's keeper triggers the full refund automatically (and anyone can trigger it permissionlessly).

### 2. What problem does it solve?
Today landlords hold both the security deposit and the inspection photos. When a landlord deducts $120 for a scratch that was already there at move-in, the renter has to prove a negative or take the landlord to small-claims court—so most students and renters simply eat the loss. Keyprint flips who holds the money and who has to prove damage: neither side (nor Keyprint) can quietly alter the sealed 3D record or freeze the escrowed deposit, and every dollar claimed must be pinned to a spot in the room right beside any co-signed move-in pins.

### 3. How does it work?
- **Invisible Consumer UX & Passkeys:** Built as an installable Desktop + Mobile PWA (Next.js App Router, TypeScript, Tailwind CSS) using **Circle Modular Wallets** (`@circle-fin/modular-wallets-core` + `viem`) with WebAuthn passkeys and automatic Gas Station sponsorship (`paymaster: true`). Main screens display dollars only with zero crypto jargon.
- **Tamper-Evident Evidence Pipeline:** Files stay in a private Supabase Storage bucket (never public IPFS) uploaded directly via short-lived signed URLs. The browser streams SHA-256 hashes via `hash-wasm`, canonicalizes manifests per RFC 8785 (`canonicalize`), and seals the 32-byte fingerprint in `KeyprintRegistry` on Arc Testnet. Anyone can drop a file into `/verify` (no login) to verify it locally against Arc—changing a single byte fails immediately.
- **3D Alignment & Comparison:** Two separate scans are aligned via 4-point Umeyama similarity solving (`ml-matrix`) and gated on `three-mesh-bvh` surface agreement (median gap `< 2 cm`, `>= 60%` within `5 cm`). A single-camera dual-pass WebGL scissor renderer drives the before/after time slider.
- **AI Suggestions & Geometric Pin Matching:** Matching 1024×768 4:3 renders are compared server-side with **Claude Opus 5.5** (`claude-opus-5-5`, structured outputs via `zodOutputFormat`). Code—never the model—raycasts detections into the aligned 3D mesh and checks proximity (`<= 15 cm` or 2D box) against qualifying move-in pins.
- **Ownerless Arc USDC Escrow:** `KeyprintEscrow` holds 6-decimal ERC-20 USDC (`0x3600000000000000000000000000000000000000`), enforces evidence authorship/ordering, 1–20 claim limits, exact deadline windows, two-sided silence defaults, reviewer resolution, permissionless settlement, and non-blocking `owed[]` fallbacks. An entire 12-transaction lease executed live on Arc Testnet for **$0.032331 USDC** in measured gas fees (verified by 20 Foundry tests including 256 fuzz runs and 2,048 stateful invariant calls).

### 4. What makes it unique?
Every deduction is a **pin with a price**, anchored to a 3D coordinate in a sealed, co-signed apartment record. Existing inspection apps are built for landlords and property managers; Keyprint is neutral, works on day one in **Solo mode** with no landlord permission needed, and puts real dollar-denominated settlement rules on Arc with zero admin keys.

### 5. What would you build next?
Native in-app LiDAR capture with device attestation, client-side encryption of 3D scans before upload, state-by-state statutory deposit deadline presets (e.g., California's 21-day rule & AB 2801 photo compliance), a renter-controlled shareable rental résumé, an independent reviewer network, card/cross-chain USDC funding via Circle Gateway & CCTP, and Arc mainnet launch after legal review of deposit custody rules.

---

## Technologies List (Devpost Tags)
`Arc`, `USDC`, `Circle Modular Wallets`, `Circle Gas Station`, `Solidity`, `Foundry`, `OpenZeppelin`, `viem`, `Next.js`, `TypeScript`, `Tailwind CSS`, `Three.js`, `React Three Fiber`, `three-mesh-bvh`, `ml-matrix`, `Claude Opus 5.5`, `Anthropic SDK`, `Supabase`, `Vercel`

---

## Pre-Submission Checklist (Complete Before Fri Nov 20, 11:00 AM CST)
- [x] Public GitHub repo with hackathon commit history (`https://github.com/Surbhu200/keyprint`)
- [x] Deployed production app open in incognito with no login wall (`https://keyprint-two.vercel.app`)
- [x] `KeyprintRegistry` + `KeyprintEscrow` deployed on Arc Testnet & tested with 20/20 Foundry unit/adversarial/fuzz/invariant tests
- [x] Full 12-tx Arc Testnet lease executed & linked in `README.md` with `$0.032331` measured USDC gas cost
- [x] Live `/verify` confirmed GREEN on original `.glb` and RED on 1-byte-changed `.glb` against Arc Testnet
- [x] Supabase private storage bucket + signed upload/download verified live on production Vercel
- [ ] Passkey sign-in + sponsored 1 USDC transfer tested on `https://keyprint-two.vercel.app/lab/wallet` (Windows + iPhone)
- [ ] Add `ANTHROPIC_API_KEY`, `KEEPER_KEY`, and `CRON_SECRET` to Vercel Environment Variables & redeploy
- [ ] Record 2–3 minute demo video (captions on, unlisted YouTube/Drive, verified playing logged-out) & paste link in `README.md` + Devpost
- [ ] Submit on Devpost + screenshot confirmation + attend closing ceremony in person Saturday Nov 21
