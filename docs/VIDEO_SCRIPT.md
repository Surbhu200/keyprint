# Keyprint — Demo Video Script (2:30) + Finalist Pitch

**For:** Devpost, UBC 2026 (Consumer Applications + Best use of Arc), due **Fri Nov 20, 2026, 12:00 PM CST**; finalist pitch **Sat Nov 21, in person**
**Setup:** one person, screen recordings from a Windows laptop (edited in Clipchamp) and an iPhone (iOS Screen Recording), one voiceover track recorded in your own voice
**Length:** 2:30 target (Devpost asks for 2–3 min; up to ~2:50 is fine, never over 3:00) · **Voiceover:** ~330 words, about 130 words per minute (read the hook a little brisker)

## Honesty rules (read before recording)

- Say "I". It's a solo build.
- **Your own voice.** Record the voiceover yourself. No text-to-speech and no AI voice.
- **Sourced numbers only.** The hook's stats come from Zillow's Consumer Housing Trends Report 2024, and the source stays on screen while the numbers do. Say "renters who moved out" and "twenty-four percent", not "most renters" or "a quarter".
- **The sticky note is staged damage.** Say so out loud ("I put this sticky note up before the move-out scan") and keep the "STAGED DAMAGE" caption on screen while the note is visible.
- `/sample` is an **illustrative sample** (Meta's Replica research scan, synthetic move-out offset, staged stain, example claims). Call it "the sample apartment".
- Everything onchain is **Arc Testnet** with **test USDC**. Caption it once.
- Scaniverse builds the 3D model. Never suggest Keyprint built the scanner.
- **Speed:** only the short Scaniverse scan B-roll (Clip 1) may be sped up, captioned "sped up". All app footage plays at real speed; long waits (uploads, the AI run) are trimmed with a visible cut and a "wait trimmed" tag. Never trim or speed up the Face ID moment or the last 3 seconds of the countdown.
- Say "tamper-evident" and "AI suggests". Never say "tamper-proof", "AI detects damage", or "legally binding".
- Never fake a step. If something fails on camera, record it again, or show what really happened and change the line to match.

---

## Shot list

| Time | What's on screen | Voiceover (exact) |
| --- | --- | --- |
| 0:00–0:15 | Black title cards (Clipchamp text): "Only 40% of renters who moved out got their whole deposit back." → "24% got none." → Keyprint wordmark. The source line stays on screen from 0:00 to 0:10 (see captions). | "Only forty percent of renters who moved out got their whole deposit back. Twenty-four percent got none. Your landlord holds the money and the photos, so you have to fight to get it back. Keyprint flips that." |
| 0:15–0:25 | iPhone screen recording: Scaniverse in Mesh mode sweeping the room corner, sped up ~6× (the only sped-up shot), ending on the finished model / `.glb` export. | "First, a real scan: an iPhone Pro's LiDAR in Scaniverse, sped up. Scaniverse builds the 3D model; Keyprint does everything after." |
| 0:25–0:33 | iPhone, Safari on the live site, Lease A: **Import custom .glb** → pick the Scaniverse file → room loads → tap the scratch → type what it is → **Attach photo (hashed into proof)** → **Already here**. Trim the loading waits (visible cut, "wait trimmed"). | "I import the scan into Keyprint, tap a scratch that's already here, and attach a close-up photo." |
| 0:33–0:50 | Terms card ($200, deadlines, reviewer) → **Seal & protect $200** → Face ID sheet → seal animation. Don't trim or speed up the Face ID moment. | "Then one Face ID touch seals the scan and my pins on Arc, and puts my two-hundred-dollar deposit in escrow with no admin key. Not even Keyprint can take it. No wallet app, no gas, no seed phrase." |
| 0:50–1:05 | Laptop, Lease A → **Compare** → **Import move-out .glb** → 4 quick, rough taps on each scan → **Solve & measure** → hold on "Fine-tuned automatically from your taps: …% → …%" and **Alignment gate passed**. | "At move-out, I import a second scan and tap four rough points in each. Keyprint fine-tunes the fit automatically, and only unlocks the comparison once the surfaces truly line up." |
| 1:05–1:20 | Drag the **Same room, before and after** slider across the wall to the sticky note → **Run AI comparison** (trim the wait) → the sticky-note card (**AI suggestion**, no dollar amount) → zoom on "It never prices anything". | "One slider sweeps the same wall, before and after. The damage is staged: I put this sticky note up before the move-out scan. The AI suggests it; it never prices anything. People decide." |
| 1:20–1:45 | Laptop, `/sample` → "Every dollar claimed pinned to the 3D record" → the $40 stain claim → the **Desk scratch** card (**$120 claimed**, struck through) → **Fly to scratch** → hold on "Matched move-in pin … co-signed by the landlord" and **Withdrawn ($0)**. | "Every claim needs a pin and a price on the exact spot in the 3D record, not 'cleaning and repairs, three hundred dollars.' In the sample apartment, an example hundred-and-twenty-dollar claim for a desk scratch lands right on a move-in pin the landlord co-signed. Their own signature disproves it, and the claim is withdrawn." |
| 1:45–2:05 | Laptop, Lease B (made with the **Demo B: no-claim refund ($100 · 1-min windows)** preset), move-out sealed, no claims → countdown runs to 0:00 → **Settle**: "The deposit is settled.", **Returned to renter $100**, "Released automatically by Keyprint once the deadline passed." | "And if the landlord files nothing? This demo lease uses one-minute windows. When the clock hits zero, Keyprint's keeper triggers settlement and the full hundred dollars comes back automatically. The contract doesn't need Keyprint: anyone can trigger it, and I have a one-tap backup." |
| 2:05–2:20 | Laptop, `/verify` ("Don't trust Keyprint. Verify it.") → drop the original sample `.glb` → green "Matches the record sealed …" → drop the 1-byte-changed copy → red "No match — file was altered or never sealed". | "Anyone can drop a file into Verify, and their own browser checks it against the fingerprint on Arc. The original scan passes. Change one byte, and it fails. Don't trust Keyprint. Verify it." |
| 2:20–2:30 | Close card: "Keyprint · Your apartment. Its history. Your proof." with `keyprint-two.vercel.app` and `github.com/Surbhu200/keyprint`. | "Ownerless escrow on Arc. About three cents of network fees for a whole lease. Solo mode is free. Your apartment. Its history. Your proof." |

---

## On-screen captions (Clipchamp text overlays)

Bottom third, high contrast, at most 2 lines on screen at once.

| In | Out | Caption text |
| --- | --- | --- |
| 0:00 | 0:05 | Only 40% of renters who moved out got their whole deposit back. |
| 0:05 | 0:10 | 24% got none. |
| 0:00 | 0:10 | *Small source line, top or bottom corner:* Source: Zillow Consumer Housing Trends Report 2024 · recent renters who moved out |
| 0:10 | 0:15 | Keyprint: the landlord has to prove every dollar. |
| 0:15 | 0:25 | Real iPhone Pro LiDAR scan · Scaniverse (Mesh mode) · sped up ~6× |
| 0:25 | 0:33 | Move-in · live site on iPhone · .glb ≈ 9 MB, real-world meters |
| 0:33 | 0:42 | One Face ID touch: seal scan + pins, protect $200 |
| 0:42 | 0:50 | Gas sponsored by Circle Gas Station · Arc Testnet · test USDC |
| 0:50 | 0:57 | 4 rough taps → automatic fine-tune · a scan can't shrink to fake a match |
| 0:57 | 1:05 | Gate: median gap ≤ 2 cm, ≥ 60% within 5 cm |
| 1:05 | 1:20 | STAGED DAMAGE: I put this sticky note on the wall before the move-out scan · AI suggests, never prices |
| 1:20 | 1:45 | Sample apartment: public research scan (Meta Replica) · staged stain · example claims, not a live lease |
| 1:45 | 2:05 | Demo lease B · $100 · 1-minute windows · no claims filed |
| 2:05 | 2:20 | Don't trust Keyprint. Verify it. · Sample scan vs. a copy with 1 byte changed |
| 2:20 | 2:25 | Measured: $0.031613 in network fees for a 12-transaction scripted test lease |
| 2:25 | 2:30 | keyprint-two.vercel.app · github.com/Surbhu200/keyprint |

Wherever you trim a wait, add a small "wait trimmed" tag for about a second. Also turn on Clipchamp's auto captions (subtitles) and fix misheard words: Keyprint, Arc, USDC, Scaniverse, LiDAR.

---

## Record these clips

### Before you hit record

- [ ] **iPhone:** Do Not Disturb on, Safari on `https://keyprint-two.vercel.app`, renter signed in with Face ID. Make a 10-second test recording to check that the Face ID sheet appears in iOS Screen Recording (Control Center → Screen Recording).
- [ ] **Laptop:** landlord in a separate Chrome profile (Windows Hello), notifications off, browser zoom ~125% so text is readable on a phone, extra tabs closed. Record with Clipchamp's screen recorder (or Snipping Tool's Record mode).
- [ ] **Test USDC:** the renter account holds at least $300 (Lease A $200 + Lease B $100) from faucet.circle.com.
- [ ] **Scans:** both Scaniverse `.glb` files are on the iPhone (Files app) and on the laptop. The move-out scan clearly shows the sticky note; if you can't see it in the 3D view, the AI won't either.
- [ ] **Verify files:** both sample files (original + 1-byte-changed copy) downloaded from `/sample`.
- [ ] **Leases:** on the laptop, Home → **New lease (landlord)** → preset → paste the renter's account ID (from their Details drawer) → **Create lease with one touch**. Make Lease A with **Demo A: full flow ($200 · 10-min windows)** and Lease B with **Demo B: no-claim refund ($100 · 1-min windows)**.

### Clips

- [ ] **Clip 1: Scaniverse (iPhone, 45–60 s raw).** The only clip you may speed up. Best: screen-record the capture you'll actually import. If the scans are already made, record yourself orbiting the saved scan in Scaniverse and exporting it as `.glb` instead. No access to the iPhone Pro any more? Use the `.glb` loading in Keyprint as the "real scan" shot (real speed) and change the line to "This is a real iPhone Pro LiDAR scan, made in Scaniverse."
- [ ] **Clip 2: Move-in (iPhone).** Lease A → **Import custom .glb** → tap the scratch → type what it really is → **Attach photo (hashed into proof)** (take the close-up live) → **Already here** → terms card → **Seal & protect $200** → Face ID → seal animation. If the mark you pin isn't a scratch, say what it really is in the voiceover.
- [ ] **Clip 3: Line-up (laptop).** Lease A → **Compare** → **Import move-out .glb** → 4 rough taps per scan (door corner, outlet, window edge, desk corner, or whatever distinct spots the corner has, on at least two walls) → **Solve & measure** → hold 2 s on the readout → drag the slider slowly both ways. If the "Fine-tuned automatically…" line doesn't appear (the taps alone were already the better fit), hold on the gate badge instead.
- [ ] **Clip 4: AI (laptop).** **Run AI comparison** → wait (trim it in the edit; don't speed it up) → hover the sticky-note card. Optional B-roll: **End lease & seal move-out** (one passkey touch), then the read-only **Sealed change report**. If the AI misses the sticky note, don't fake it: tap **Run fresh** once (a normal run returns the saved answer for the same scans); if it still misses, add the change by hand and say "the AI missed it, so I added it myself."
- [ ] **Clip 5: Sample claims (laptop).** `/sample` → scroll to the claims card → **Fly to scratch** on the $120 desk scratch → hold on the co-signed match and **Withdrawn ($0)**.
- [ ] **Clip 6: Lease B refund.** Renter: **Seal & protect $100** (iPhone) → **End lease & seal move-out** (either side; it needs the alignment gate) → on the laptop, record the last ~15 s of the 1-minute claim countdown with the lease's Claims tab open (it shows the countdown; any open lease screen asks Keyprint's keeper to settle at zero) → **Settle**. If the page says "Released with one tap by the renter or landlord" instead, change the voiceover to match.
- [ ] **Clip 7: Verify (laptop).** `/verify` → original sample `.glb` (green) → 1-byte-changed copy (red).
- [ ] **Clip 8: Title cards.** Hook and close cards made with Clipchamp text on a plain background, with the Zillow source line on the stat cards. Optional: a 2-second shot of the README gas table showing `$0.031613`.
- [ ] **Voiceover (your own voice).** Quiet room, Windows Sound Recorder or iPhone Voice Memos, read straight from the table. Do 2–3 takes and keep the best take of each line. No text-to-speech or AI voice.

### Edit in Clipchamp

1. Import every clip and the voiceover. Lay the voiceover down first, then cut the clips to fit it.
2. Speed up only Clip 1 (~6×) and caption it "sped up". Everything else plays at real speed: trim long waits (uploads, the AI run, confirmations) with a visible cut and a "wait trimmed" tag. Never trim or speed up the Face ID moment or the last 3 seconds of the countdown.
3. Add the caption overlays from the table (including the source line under the hook stats), then auto captions.
4. Export at 1080p. Upload to YouTube as **Unlisted** (or Google Drive with "Anyone with the link"). Open the link in a logged-out window, then paste it into `README.md` and Devpost.

To move iPhone clips to the laptop: USB cable + the Windows Photos app (Import), or upload them to Google Drive.

---

## Finalist Pitch (4 min) + Q&A (2 min)

Up to 13 finalists pitch in person on Saturday, Nov 21: 4 minutes, then 2 minutes of questions, and you must be in the room to win. Tell one story, live: a sealed move-in, a lined-up move-out, a priced claim, a USDC split, and a file anyone can verify. The video covers the Face ID move-in and the keeper refund, so the stage shows the parts judges can watch happen.

### Setup (Saturday morning, on the stage laptop)

- [ ] Code stays frozen at the submitted commit.
- [ ] **Two Chrome profiles on this exact laptop:** renter and landlord, each signed in with its own Windows Hello passkey; one full-screen window each, switched with Alt+Tab. Display **mirrored** so every passkey prompt shows on the projector; notifications off; zoom ~125% for the back row. Say "one touch" on stage (say "Face ID" only on a phone).
- [ ] **Pitch lease (Demo A), taken to mid-flow.** Landlord: Home → **New lease (landlord)** → **Demo A: full flow ($200 · 10-min windows)** → paste the renter's account ID (from the renter profile's Details drawer) → **Create lease with one touch**. Renter: **Import custom .glb** (move-in scan) → pin one real pre-existing mark with **Attach photo (hashed into proof)** → **Already here** → **Seal & protect $200**. Landlord: Review screen → **Co-sign move-in record**. Renter: **Compare** → **Import move-out .glb** (the scan with the sticky note) → 4 taps → **Solve & measure** until **Alignment gate passed** → **Run AI comparison** once, so its report is cached.
- [ ] **Stop there.** Don't press **End lease & seal move-out** until you're on stage: until then no clock is running, so the lease can wait for hours. Once the lease ends, the landlord has 10 minutes to file.
- [ ] Keep the renter's Compare page open after **Run AI comparison** (don't reload it): the suggestion cards stay on screen and get sealed with the move-out. If it does reload, **Import move-out .glb** again with the same file (the saved line-up comes back without re-tapping), then **Run AI comparison** again: the views take a few seconds to render and upload, then the cached report for the same scans comes back.
- [ ] Tabs open, in order: renter → Lease A **Compare**; landlord → Lease A **Claims**; `/sample`; `/verify` (both sample `.glb` files on the desktop); Lease B's settle page from the video (whichever release path it shows); the README receipts table.
- [ ] The laptop renter account holds at least $200 in test USDC, plus margin, from faucet.circle.com.
- [ ] Phone hotspot on and joined once. Offline copies of the 2:30 video and a full-length rehearsal recording on the desktop, a USB stick, and the phone, with each beat's timestamp on a card.
- [ ] Rehearse end to end 3 times, finishing by 3:50, and time each of the three passkey touches. Each full run uses up a lease (its deposit settles), so make a fresh Demo A lease for every rehearsal plus one for the stage; the claimed amount moves to the landlord account each run, so top the renter back up.

### Minute by minute

| Time | On screen | Say (short lines; don't read them) |
| --- | --- | --- |
| 0:00–0:25 | Slide: "Hands up if you've lost money from a security deposit." Then the stat slide, with its source line. | Count the hands out loud (under three: "Lucky room. Here's what happens to everyone else."). "Zillow's 2024 renters report: only 40% of renters who moved out got their whole deposit back, and 24% got none. Even renters who documented everything got a full refund only half the time." |
| 0:25–0:45 | The Today vs Keyprint table. | "Your landlord holds your money and the evidence. Keyprint flips that: your deposit sits in an escrow on Arc that nobody controls, not even me. Every dollar the landlord keeps has to be pinned to a spot in your apartment's sealed 3D record and priced. And if they don't claim in time, it comes back to you." |
| 0:45–1:40 | **Live, renter (Lease A Compare):** the move-out scan already lined up (the slider card reads "Median surface gap … cm; …% of the scan within 5 cm") → drag **Same room, before and after** → the sticky-note card → **End lease & seal move-out** (**touch 1**; it hashes and uploads the ~9 MB move-out scan first, so the prompt takes a few seconds). | "This is a real iPhone LiDAR scan of a room corner, sealed on Arc at move-in and co-signed by the landlord account, which I'm also playing today. At move-out, four rough taps and an automatic fine-tune lined up the second scan; the median gap has to be two centimeters or less, with at least sixty percent of the surface within five, or the comparison stays locked. The damage is staged: I put this sticky note up before the move-out scan. The AI suggests it and never prices anything. Now I end the lease with one touch." |
| 1:40–2:30 | **Live, landlord (Alt+Tab → Lease A Claims):** tap the sticky note → title + price (e.g. $25) → **Stage pin** → **File 1 claim & close claims** (**touch 2**). **Renter (Alt+Tab):** the claim appears within ~2 s → **Approve & settle** (**touch 3**) → the split → **Open settlement receipt**. | "To keep a single dollar, my landlord has to pin it and price it. I approve, and one settlement pays both sides: twenty-five dollars for the damage, a hundred seventy-five back to me, in USDC on Arc, in seconds. The receipt shows the network fees, in dollars." |
| 2:30–3:00 | `/sample` → **Fly to scratch** → "Matched move-in pin … co-signed by the landlord" → **Withdrawn ($0)**. | "And when a landlord claims something that was already there? In the sample apartment, an example hundred-and-twenty-dollar claim lands on a move-in pin the landlord co-signed. Their own signature disproves it." |
| 3:00–3:25 | `/verify`: original sample `.glb` → green; 1-byte-changed copy → red. | "Anyone can check the evidence without trusting me. The original sample scan passes. Change one byte, and it fails." |
| 3:25–3:50 | Close slide: "$0.031613 for a 12-transaction scripted test lease on Arc Testnet · passkeys · sponsored gas · no admin key · Solo mode is free", plus the two links. | "Fees on Arc are dollars: a whole scripted lease cost about three cents. Passkeys, sponsored gas, and an escrow with no admin key. Solo mode is free and works today without a landlord; next comes in-app capture and a record you carry to your next apartment. To everyone who raised a hand: on a Keyprint lease, your landlord has to prove every dollar. Your apartment. Its history. Your proof." |
| 3:50–4:00 | Hold on the close slide. | Buffer for slow prompts. |

If you swap the $25 for another price, change the split line to match (the deposit is $200).

### Q&A (2 min)

- The answers live in `docs/DEVPOST.md` → **Judge Q&A Prep**. Keep it open on your phone.
- Under 20 seconds each, say "I", and admit limits plainly.
- Show instead of tell: the one-byte Verify test (faked or edited scans), the gate readout on Compare (line-up), `/sample`'s co-signed pin (why pins matter), Lease B's settle page (automatic refund), the README receipts table (cost).

### If something breaks (never debug on stage)

| What fails | Do this |
| --- | --- |
| Venue Wi-Fi | Switch to the phone hotspot (already joined). The scans, the AI, Verify and every transaction need the network, so if the hotspot fails too, play the 2:30 video from the matching timestamp and narrate over it. |
| A passkey prompt doesn't appear or errors | Cancel and tap once more. If it fails again, say "Let me show you the recording," play that beat from the rehearsal recording, then continue live with the parts that need no passkey: `/sample`, `/verify`, Lease B's settle page. |
| A step hangs (no receipt after ~20 s) | Say "while that confirms…" and show the next tab; come back once it lands. If it hasn't landed by the end of the beat, play the recording. |
| The AI is slow or down | The report for these exact scans is cached and comes back right away. If even that fails, the page offers **Add change**: say "The AI isn't available, so I add the change myself." That's the real fallback. |
| Laptop or projector dies | Play the 2:30 video from the phone or the USB stick on any machine and narrate. |
| You're running long | Skip `/sample` (2:30–3:00) and go straight to Verify. |
