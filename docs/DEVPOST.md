# Keyprint — UBC 2026 Devpost Submission Kit

**Submission Deadline:** Friday, Nov 20, 2026 @ 12:00 PM CST  
**Submission Portal:** [ubc-hackathon-2026.devpost.com](https://ubc-hackathon-2026.devpost.com)  
**Finals:** up to 13 finalists pitch in person on Saturday, Nov 21 (4 min + 2 min Q&A, and you must be there to win). Pitch plan: `docs/VIDEO_SCRIPT.md`.

## Track & Awards Selection
- **Main Track (Required — pick 1):** `Consumer Applications`
- **Chain Award (Optional — pick 1):** `Best use of Arc`
- **Bounties:** None *(per strategy in `docs/BUILD.md`: focus cleanly on Consumer + Arc + Overall UBC Winner)*

## What the Judges Score, and Where Keyprint Shows It

| Criterion | Keyprint's proof |
| --- | --- |
| Technical Execution ("effective use of blockchain infrastructure") | Evidence fingerprints, co-signs, the deposit, claims, deadlines, and payouts in two ownerless contracts on Arc; 20 Foundry tests including fuzz and invariant tests; a full 12-transaction scripted test lease on Arc Testnet for $0.031613 in USDC fees; `/verify` checks any file against Arc in the browser |
| Product & UX | Face ID or Windows Hello passkeys, no seed phrase, no gas, dollars on every main screen; one touch per step |
| Innovation | Every claim filed in Keyprint is a priced pin on a sealed 3D record (anything filed around the app is flagged), and the evidence and the money live together |
| Impact & Potential | Only 40% of recent renters who moved out got their whole deposit back (Zillow 2024); Solo mode works today without a landlord |
| Demo | Line-up gate → AI suggestion on staged damage → priced claim → USDC split → Verify green and red |

## Links to Paste on Devpost
- **Live Deployed App (Installable PWA + Web):** [https://keyprint-two.vercel.app](https://keyprint-two.vercel.app)
- **Public GitHub Repo (README = technical docs + architecture):** [https://github.com/Surbhu200/keyprint](https://github.com/Surbhu200/keyprint)
- **KeyprintRegistry (Arc Testnet):** [https://explorer.testnet.arc.io/address/0x57cF232F1e0c250d6bcA49Af6461ee477f450341](https://explorer.testnet.arc.io/address/0x57cF232F1e0c250d6bcA49Af6461ee477f450341)
- **KeyprintEscrow (Arc Testnet):** [https://explorer.testnet.arc.io/address/0x97d85aC09C01ed2dBf2611b7B91fF4BB2A69654a](https://explorer.testnet.arc.io/address/0x97d85aC09C01ed2dBf2611b7B91fF4BB2A69654a)
- **Demo Video (2–3 min, unlisted YouTube / Drive):** _Paste link after recording Friday morning_

---

## Copy-Paste Written Answers

### 1. What did you build?
Keyprint is a renter-owned, tamper-evident 3D record of an apartment, paired with a USDC security-deposit escrow on Arc that nobody controls, not even me. At move-in, the renter imports a phone LiDAR scan, pins damage that's already there, and one passkey touch (Face ID or Windows Hello) seals the record on Arc and puts the deposit in escrow: no wallet app, no gas, no seed phrase. At move-out, four rough taps and an automatic fine-tune line up the second scan, a slider sweeps the same wall before and after, and AI suggests what changed while code checks each change against the move-in pins. To keep a single dollar, the landlord has to pin it to a spot in the 3D record and price it. One settlement pays both sides in USDC, and if the landlord files nothing by the deadline, Keyprint's keeper releases the full deposit back to the renter (and anyone can trigger it). It runs on Arc Testnet today, and renters can start alone in free Solo mode.

### 2. What problem does it solve?
Your landlord holds your deposit and the evidence. In Zillow's Consumer Housing Trends Report 2024, the typical deposit was $750, yet only 40% of recent renters who moved out got all of it back, and 24% got none. 41% disagreed with their landlord about something, 19% over damage or repairs. Documentation alone doesn't fix it: renters who documented everything got a full refund only 50% of the time, versus 41% for those who documented nothing. To fight a deduction, the renter has to chase money the landlord already holds, often in small-claims court. Keyprint flips who holds what: the money sits in an ownerless escrow, the evidence is sealed so neither side can quietly change it, the landlord has to prove every dollar with a priced pin, and if they stay silent, the deposit comes back. (Source: https://www.zillow.com/research/renters-housing-trends-report-2024/)

### 3. How does it work?
- **Scan, then fingerprint on Arc:** A phone LiDAR app builds the 3D model (I used Scaniverse's Mesh mode on an iPhone Pro: `.glb`, ~9 MB, real-world meters). The browser streams a SHA-256 hash (`hash-wasm`), canonicalizes the manifest (RFC 8785), and seals the fingerprint in `KeyprintRegistry` on Arc; the file goes straight to a private Supabase bucket through a short-lived signed URL. Anyone can drop a file into `/verify` and their own browser checks it against Arc: the original sample scan passes, and a copy with one byte changed fails.
- **Invisible crypto (Circle on Arc):** Circle Modular Wallets give each person a passkey smart account (Face ID sign-up tested on an iPhone in Safari on the live site). Every passkey action is an ERC-4337 UserOperation sponsored by Circle Gas Station (`paymaster: true`), with several calls batched into one touch (move-in = seal scan + pins + USDC `approve` + `fund`). Main screens show dollars, never tokens.
- **Why Arc:** USDC is Arc's gas token, so fees are dollars: a full 12-transaction scripted lease cost $0.031613. Finality is deterministic, so one receipt is final: a seal shows immediately with the Arc block's timestamp, and countdowns run on Arc's clock. Deposits use the 6-decimal USDC ERC-20 interface (`0x3600…0000`); fees are measured in 18-decimal native USDC, and the two are never mixed.
- **A line-up that has to pass a gate:** 4 rough taps give a Umeyama similarity fit; an automatic point-to-plane ICP fine-tune on a `three-mesh-bvh` index then snaps the surfaces together (pairing radius shrinking from 30 cm to 3 cm, rigid so a scan can't shrink to fake a match, retries within 2.5 s). The comparison unlocks only past a gate: median gap ≤ 2 cm and ≥ 60% of the surface within 5 cm. On my two real scans with simulated taps off by 2–4 cm per axis, the fine-tuned fit passed 15 of 15 trials; taps alone passed 1–4 of 15.
- **AI suggests, code matches, people decide:** Matching 1024×768 before/after renders (up to 12 pairs: one per move-in pin for the first 6 pins, up to 2 close-ups of spots where the move-out surface's color clearly differs, plus the floor and walls) go to Google Gemini (`gemini-3.5-flash` first) or Claude Opus 5.5. Output is Zod-validated JSON; the model sees only view labels and pin pixel positions and never prices anything. Code, not the model, matches each change to move-in pins (≤ 15 cm in 3D, or inside its box when within 0.5 m). After move-out, the change report is sealed and the compare page goes read-only.
- **Every dollar needs a pin and a price:** The landlord files claims as priced pins sealed as evidence. A claim that lands on a move-in pin opens next to that pin's close-up photo, and the renter approves or disputes line by line.
- **Money moves by rules:** `KeyprintEscrow` (ownerless, no proxy) checks evidence authorship and ordering, claim limits, and deadlines. An unanswered claim counts as accepted, an unresolved dispute goes back to the renter, and no claims means a full refund. Settlement is permissionless: Keyprint's keeper triggers it at the deadline while any of the lease's screens or Home is open (a daily cron job is the backstop), the renter has a one-tap backup, and the settle page says which one released it. Covered by 20 Foundry tests, including fuzz (256 runs) and invariant tests (64 runs × depth 32).

### 4. What makes it unique?
Other tools document apartments well: Tenant Trace offers LiDAR scans, fingerprinted photos, and co-signing, and RentCheck guides tenants through timestamped photos for property managers. Deposit alternatives like Rhino, LeaseLock, and Obligo replace the deposit with a bond, insurance, or a charge on the renter's account. Keyprint's difference is that the evidence and the money live together. The deposit sits in an ownerless escrow on Arc, and every claim filed in Keyprint is a priced pin on the sealed 3D record (the contract demands the landlord's own sealed claim evidence, and the app flags anything filed around it), so the landlord's own co-signed move-in pin can disprove a bogus claim. Missed deadlines default in code: if the landlord files nothing the deposit comes back, an unresolved dispute goes back to the renter, and an unanswered claim counts as accepted. The renter owns the record and can start alone in free Solo mode, and a whole scripted lease cost about 3 cents in network fees.

### 5. What would you build next?
In-app LiDAR capture with device attestation (today a scanning app builds the model); a renter-owned record that carries to the next apartment as a rental résumé the renter chooses to share; my own scans replacing the Replica sample apartment, plus alignment tests across many more rooms and phones; server-side login and client-side encryption of scans; onchain checks for priced pins; state deadline presets (like California's deposit-return deadline and AB 2801 photo duties); an independent reviewer network; cross-chain USDC funding through Circle Gateway and CCTP, plus a card on-ramp; and an Arc mainnet launch after legal review of deposit custody rules.

---

## Technologies List (Devpost Tags)
`Arc`, `USDC`, `Circle Modular Wallets`, `Circle Gas Station`, `ERC-4337`, `WebAuthn`, `Solidity`, `Foundry`, `OpenZeppelin`, `viem`, `Next.js`, `TypeScript`, `Tailwind CSS`, `Three.js`, `React Three Fiber`, `three-mesh-bvh`, `ml-matrix`, `hash-wasm`, `Google Gemini`, `Anthropic SDK`, `Zod`, `Supabase`, `Vercel`, `Scaniverse`

---

## Judge Q&A Prep

Answer in under 20 seconds, say "I", admit limits plainly, and show the product instead of describing it whenever you can.

### The ones you'll almost certainly get

**How often would people use this?**
The escrow is honestly once per lease, but the record lives through the whole tenancy: either side can seal a timestamped pin in the 3D room whenever something breaks ("Leak under sink, reported"), and Solo mode works with no landlord at all. Carrying the record to your next apartment as a rental résumé you choose to share is roadmap, not built.

**Why blockchain?**
Neutral evidence and neutral money: whoever runs a database can edit the record or freeze the deposit. On Arc the fingerprints are public and the escrow has no admin key (not even Keyprint can move a deposit). Anyone holding a file and its downloaded evidence bundle can check it against Arc, and once a lease has ended and its deadlines have passed, anyone can trigger settlement, even if Keyprint disappears.

**How is this different from Tenant Trace, RentCheck, or Rhino?**
Tenant Trace (LiDAR, fingerprinted photos, co-signing) and RentCheck (timestamped photos, sold to property managers) document the unit; Rhino and LeaseLock replace the deposit with a surety bond or zero-deposit insurance, paid as a nonrefundable premium or a monthly fee. With Keyprint the renter still pays a real deposit, but it sits in an ownerless escrow where each deduction must cite the landlord's own sealed evidence (in Keyprint, a priced pin on the 3D record) and the landlord's silence returns the money.

**Can't the renter fake the scan?**
Every file is fingerprinted and sealed on Arc the moment it's added, the landlord reviews the scan and pins at move-in (co-signing, or contesting specific pins), and any later edit fails Verify (show the one-byte test). Honest limit: a scanning app builds the model and there's no device attestation yet; in-app capture is next.

**Is it legal?**
Keyprint supports your evidence; it doesn't replace a court and isn't legal advice. Solo mode holds no money, but holding deposits in a USDC escrow and the silence defaults need state-by-state legal review before launch, which is why everything here runs on Arc Testnet with test USDC.

**How accurate is the AI, and who decides?**
One small live test, not a benchmark: on synthetic before/after images, `gemini-3.5-flash` answered a pair in about 5 seconds, found both planted changes (a floor stain and a wall hole), and ignored a pre-existing scratch. On the two real phone scans (the staged sticky note was on a wall none of the fixed overview cameras face), the change-spotting step aimed a camera at it and the comparison returned exactly one item, "Sticky note on wall" (possible wear, high confidence, box on the note), in about 17 s with the batches sent in parallel. It only suggests: code matches changes to move-in pins, the landlord sets every price, the renter approves or disputes, and only the reviewer the renter accepted before paying can rule on a dispute, onchain (there's no reviewer screen yet, so a dispute nobody resolves goes back to the renter).

**What does a lease cost?**
About 3 cents in network fees: a full 12-transaction scripted lease on Arc Testnet cost $0.031613 in USDC, and in the app Circle Gas Station sponsors every passkey step and Keyprint's keeper pays for its own settle() transaction, so neither renter nor landlord pays gas. Solo mode is free; the plan is for landlords to pay per move-out later (not built).

**What did you build, and what did you use?**
I built both contracts and their Foundry suite, sealing and Verify, the scan line-up and surface gate, the before/after slider, the render-and-AI pipeline with code-side pin matching, claims, settlement, the keeper, and every screen. I used Scaniverse for 3D reconstruction, Meta's Replica scan for the sample apartment, Circle Modular Wallets and Gas Station on Arc, Supabase, Vercel, and the Gemini and Claude APIs; AI coding assistants also helped me write and review code, which the event rules allow.

### Also likely

**Which parts of the demo are real?**
The phone scans are real iPhone Pro LiDAR captures made in Scaniverse, every transaction is real on Arc Testnet with test USDC, the renter and the landlord are two of my own accounts, and the sticky-note damage is staged. The `/sample` apartment is Meta's Replica research scan with a synthetic move-out offset, a staged stain, and example claims, and it's labeled that way.

**How do you know the two scans line up?**
Four rough taps, then an automatic fine-tune that stays rigid so a scan can't shrink to fake a match; the comparison stays locked unless the median gap is 2 cm or less with at least 60% of the surface within 5 cm. On my two real scans with simulated taps off by 2–4 cm per axis, the fine-tune passed 15 of 15 trials versus 1–4 of 15 for taps alone, and the best possible fit is about a 1.6 cm median gap with about 75% within 5 cm.

**Is the refund really automatic?**
Contracts don't run on their own: once the deadline passes, `settle()` is open to anyone, Keyprint's keeper calls it at zero whenever any of the lease's screens or Home is open (a daily cron job catches leases nobody has open), the renter has a one-tap Release button, and the settle page shows which one released it. If Keyprint disappeared, anyone could still trigger it (show Lease B's settle page).

**Can a landlord skip the pin by calling the contract directly?**
They can file, but only with their own evidence sealed after move-out, and a claim without a priced pin shows up flagged next to Dispute. Checking the pin onchain is next.

**Does a renter need crypto?**
No wallet app, gas, or seed phrase: a passkey and dollars in USDC. On testnet the USDC comes from a faucet; cross-chain funding through Circle Gateway and CCTP, plus a card on-ramp, is roadmap.

**Why would a landlord agree to this?**
Solo mode doesn't need them. Landlords who join get paid for real damage as soon as claims are final, without a small-claims fight, and in California AB 2801 already requires them to photograph units at move-in and around deducted repairs.

**Isn't scanning my home a privacy risk?**
Only fingerprints go onchain; the files sit in a private bucket behind short-lived signed links. Honest limit: there's no server-side login yet, so anyone with a lease link can open its scans; login and client-side encryption are next.

---

## Pre-Submission Checklist (Complete Before Fri Nov 20, 11:00 AM CST)
- [x] Public GitHub repo with hackathon commit history (`https://github.com/Surbhu200/keyprint`)
- [x] Deployed production app open in incognito with no login wall (`https://keyprint-two.vercel.app`)
- [x] `KeyprintRegistry` + `KeyprintEscrow` deployed on Arc Testnet & tested with 20/20 Foundry unit/adversarial/fuzz/invariant tests
- [x] Full 12-tx Arc Testnet lease executed & linked in `README.md` with `$0.031613` measured USDC gas cost (scripted run)
- [x] Live `/verify` confirmed GREEN on original `.glb` and RED on 1-byte-changed `.glb` against Arc Testnet
- [x] Supabase private storage bucket + signed upload/download verified live on production Vercel
- [x] Face ID sign-up tested on iPhone (live, Nov 20)
- [x] Real-scan line-up measured on both Scaniverse scans (fine-tune 15/15 vs taps alone 1–4/15) and written up in `README.md`
- [ ] Sponsored 1 USDC transfer tested on `https://keyprint-two.vercel.app/lab/wallet` (Windows + iPhone)
- [x] Add `GEMINI_API_KEY`, `KEEPER_KEY`, and `CRON_SECRET` to Vercel Environment Variables & redeploy
- [ ] Record 2–3 minute demo video (your own voiceover, captions on, unlisted YouTube/Drive, verified playing logged-out; script, shot list & clip checklist: `docs/VIDEO_SCRIPT.md`)
- [ ] Paste the video link into `README.md` and Devpost
- [ ] Devpost form: `Consumer Applications` + `Best use of Arc` selected, five answers pasted, technologies listed, repo + live app + both contract addresses pasted, every team member added
- [ ] Submit on Devpost + screenshot the confirmation
- [ ] Saturday Nov 21: be there in person (closing ceremony, and the finals if selected); pitch kit ready (`docs/VIDEO_SCRIPT.md` → Finalist pitch)
