Keyprint — Build Document
Your apartment. Its history. Your proof.
Nov 18, 2026 · ​@Chase · UBC 2026 Hackathon · Track: Consumer Apps · Chain award: Best
use of Arc
The pitch in 30 seconds
Keyprint flips the security deposit: the landlord no longer holds your money or the
evidence, and has to prove every dollar they keep.
Say it like this: "Today your landlord holds your money and the evidence, and you have to
sue to get it back. With Keyprint, your deposit sits in escrow, every dollar they claim has to
be pinned to a spot in your apartment's 3D record, and if they don't claim in time, it comes
back to you."
The problem, in human words. You move out. Your landlord keeps $120 for a scratch that
was there when you moved in. They hold the money and the photos. Getting it back
means small-claims court, so many people just eat the loss.
The flip
Today
With Keyprint
Who holds the
deposit
The landlord
An escrow contract on Arc that
neither side controls
Who holds the
evidence
The landlord's phone
Both sides; each file's fingerprint is
sealed on Arc the moment it's added,
and the landlord co-signs or contests
it
Who has to prove
damage
The renter must prove they
didn't do it
The landlord must pin each claim to a
spot in the 3D record and price it
If nobody does
anything
The landlord keeps the
money
Once the deadline passes, the full
deposit goes back to the renter:
Keyprint triggers it, and anyone can
Keyprint — Build Document

The mechanic nobody else has: every deduction is a pin with a price. A landlord can't
write "cleaning and repairs, $300." They drop a pin on the exact scratch in the 3D model
and attach a dollar amount, right next to the move-in scan and any pins the renter left
there. The contract rejects any claim without its own sealed evidence filed after move-
out, and Keyprint only creates that evidence from a priced pin. A claim filed around the
app shows up flagged for the renter, next to a Dispute button.
Why it needs a blockchain. Neutral evidence and neutral money. If the record lived on the
landlord's servers, or on Keyprint's, whoever runs the database could change it. Remove
the blockchain and the idea breaks.
Why now. California's AB 2801 now requires landlords to photograph units at move-in and
move-out. The evidence is starting to exist by law; the open question is who controls it.
Close every pitch with: Your apartment. Its history. Your proof.
Winning strategy
Enter Consumer Apps with Best use of Arc. The surest path to the finals is being the best
Arc project in Consumer, one of the 13 finalist slots, while the overall prize is entered
automatically.
Prize stack (all stack together)
Prize
Amount
How Keyprint gets it
Official UBC Winner, 1st
$2,500 + 3 months
ElevenLabs Pro per member
Best story in the room plus a
demo that works
Consumer Apps Track
Winner
$2,000
Invisible crypto, a record you
open whenever something
breaks, polished UI
Best use of Arc
(Consumer)
$1,000
USDC escrow, Circle Wallets,
sponsored gas, real Arc
transactions with measured
USDC fees
QuickNode Streams
bounty (optional)
$500
Skip unless you finish early, and
only if Streams genuinely
powers the activity feed

Skip the Gemini, ElevenLabs and Grok bounties. They don't fit, and the bounty rules
penalize bolted-on features.
Three ways into the final 13
1. Top Arc project in Consumer: the likeliest. You only have to beat other Arc projects in
this track.
2. Top contender for Consumer Track Winner.
3. Top three contenders for the overall award.
How each judging criterion is won
What judges must feel
At 30 seconds: "I've lived this."
At 2 minutes: "I've never seen blockchain used like that."
At 4 minutes: "I would actually use this."
Claims we make, and claims we never make
Criterion
What judges must see
Keyprint's answer
Technical
execution
Real depth, real chain use
Escrow state machine on Arc, onchain
fingerprints, 3-point 3D alignment, AI
change report, passkey smart wallets
Product and UX
A real product, not a
prototype
Passkey sign-in (Face ID or fingerprint),
dollars only, a time slider through the
room, a real deadline refund
Innovation
Something they haven't
seen
Every deduction is a pin with a price, tied
to a spot in a 3D record
Impact and
potential
People would use it
Renters can use it alone today; landlords
join later; a clear business
Demo
Value obvious in 30
seconds
A show of hands, a disproved claim, a live
USDC split
Say this
Never say this
"Tamper-evident: any change after sealing is
detectable"
"Tamper-proof"

Hard requirements (miss one and you're out)
The product
Keyprint is a renter-owned, living 3D record of an apartment, plus an escrow that settles
the deposit from that record. Renters can use it alone on day one; landlords join for
escrow and a fast, fair settlement.
Two modes: this is how it spreads
Say this
Never say this
"The AI suggests; people decide what's
chargeable"
"AI detects damage" or "the AI decides"
"Released the moment the deadline passes;
anyone can trigger it"
"The contract pays out by itself"
"Supports your evidence in a dispute"
"Legally binding" or "replaces small-claims
court"
"A scanning app reconstructs the 3D model;
the evidence history, comparison and
settlement are ours"
Anything implying you built the 3D scanner
"We found nothing that combines these
pieces"
"First ever" or "nobody has done this"
Real numbers from a poll you actually ran
Interviews or numbers you didn't collect
Consumer: interacts with the blockchain and has a working, user-facing frontend
Arc: core onchain logic on Arc testnet; README lists every contract address and
explains how Keyprint uses Arc
Public GitHub repo created during the hackathon, with setup instructions and
architecture docs
Working demo (deployed link) and a 2–3 minute video on YouTube or Google Drive,
viewable by judges
Devpost: main track, chain award = Arc, written answers to the five questions
Team present in person on Saturday, Nov 21

The five moments
1. Move in: "Seal your apartment." The renter adds the 3D scan of the apartment and
pins what's already damaged. One passkey prompt seals it, and the fingerprint lands
on Arc in seconds.
The landlord gets a review window (7 days by default) to co-sign or contest
specific spots. Silence counts as acceptance.
Memorable beat: the seal animation and a "Verify" link anyone can click.
2. Pin: "Tap the wall." Tap any spot in the 3D room to leave a signed, timestamped note
with a photo.
Move-in: "Scratch on desk, already here." During the lease: "Leak under sink,
reported." Move-out: "Stain came from the upstairs leak."
The seal time is onchain, so only pins from the move-in window, or co-signed by
the landlord, count as move-in evidence.
3. Move out: "See what changed." A second scan is lined up with the first in a few taps,
and Keyprint measures how closely the two surfaces agree.
Drag a time slider across the room to sweep from before to after on the same wall.
AI suggests each change as possible damage or possibly normal wear. Keyprint's
code checks whether it sits on a move-in pin. People decide what is chargeable.
4. Claim: "Every dollar needs a pin." The landlord can only claim money by pinning a spot
and pricing it.
Each claim is checked against move-in pins by distance. A claim on a co-signed pin
opens beside that pin, its photo and the co-sign. The renter approves or disputes
line by line.
Solo mode
Full mode
Who takes
part
The renter
Renter, landlord, and a reviewer the
renter accepts before paying
What it
does
Scans and pins sealed onchain, so
the record provably existed on
move-in day
Deposit held in escrow, landlord co-
signs move-in, claims are priced
pins, one settlement pays both sides
Why it
matters
Works without anyone's permission
Money moves by rules, not by
whoever is holding it
Who pays
Free
Landlord, per move-out (later)

Memorable beat: a $120 claim landing exactly on a co-signed move-in pin.
5. Settle: "Money moves by rules." Once every claim is final, one settlement pays both
sides in USDC.
Disputed lines go to the reviewer the renter accepted before paying. If the
reviewer misses its deadline, the disputed amount goes back to the renter.
If the landlord files nothing by the deadline, Keyprint's keeper triggers the full
refund the moment the clock runs out, and the renter can tap one button to do it
themselves.
Who it is for: renters first, especially students; small landlords who want proof too;
property managers later.
The long game (pitch it, don't build it): the renter's sealed history becomes a rental
résumé they choose to share with their next landlord. It is never a public score.
The 4-minute demo
One story, told live: a $200 deposit, a fair $40 charge for real damage, and a $120 claim
disproved by the landlord's own signature. Every dollar on screen is real testnet USDC on
Arc. It ends at 3:50; the last 10 seconds absorb slow prompts.
Time
On screen
You say
0:00
Black slide: "Who here has lost money
from a security deposit?"
"Hands up if you've lost money from a
security deposit." Count them out loud.
(Under three hands: "Lucky room. Here's
what happens to everyone else.")
0:10
The Today vs Keyprint table
"Today your landlord holds your money
and the evidence, and you have to sue to
get it back. With Keyprint, your deposit
sits in escrow, every dollar they claim
has to be pinned to a spot in your
apartment's 3D record, and if they don't
claim in time, it comes back to you."
0:35
Renter view: the 3D room. Tap the desk
scratch, tap "Already here," photo
attached
"Move-in day. This is my room, scanned. I
pin the scratch that was already there."

Time
On screen
You say
0:50
Terms card ($200, deadlines, reviewer),
then Seal & pay: one prompt seals the
scan and pins and puts $200 in escrow.
Seal animation
"One touch. My move-in record is sealed
on Arc, and my $200 sits in a contract
with no admin key. Not even we can take
it."
1:10
Landlord view: Co-sign
"My landlord co-signs the move-in
record. Now it's agreed."
1:25
Verify: drop in the scan; green, "sealed
by the renter, co-signed by the landlord."
Drop in the copy with one byte changed;
red
"Anyone can check this without trusting
us. Change one byte, and it fails."
1:40
Renter view: the move-out scan, already
lined up, with its readout. Tap End lease.
Drag the time slider across the desk and
carpet
"A year later, I move out. I lined up the
scans with a few taps, and that's sealed
too. Same wall, before and after."
2:05
AI suggestions: stain = possible damage;
scuffs = possibly normal wear. Nothing
flagged at the desk; it didn't change
"AI compared the scans and suggests
what changed. It never prices anything.
People decide."
2:20
Landlord view: drop two priced pins,
stain $40 and desk scratch $120; one
prompt files both and closes claims
"To keep a single dollar, the landlord has
to pin it to a spot and price it."
2:40
Renter view: the $120 card reads "On a
move-in pin, co-signed by your landlord,"
with both scans. Tap Dispute. Landlord
view: Withdraw
"That scratch? They co-signed it at
move-in." Then: "Faced with their own
signature, the landlord withdraws."
3:05
Renter view: Approve & settle on the
$40 stain (one prompt). The split counts
up: $40 to the landlord, $160 back. Open
the receipt
"Forty dollars for real damage, paid in
seconds. A hundred sixty back to me, in
USDC on Arc. No court."
3:25
Home: Lease B, where the landlord filed
nothing: "$200 returned," sent by
Keyprint's keeper
"Here the landlord filed nothing. When
the clock hit zero, Keyprint triggered the
refund: all $200 back. If we disappeared,
anyone could."

Seven live prompts, each one batched
1. Renter, Seal & pay: seal the move-in manifest and pins, approve , fund .
2. Landlord, Co-sign: acknowledge the manifest and every move-in pin.
3. Renter, End lease: seal the move-out manifest, the saved alignment and the cached AI
report, then endLease .
4. Landlord, File claims: two claim-evidence seals, two fileClaim , then closeClaims .
5. Renter, Dispute.
6. Landlord, Withdraw.
7. Renter, Approve & settle: acceptClaim , then settle .
Every manifest carries the lease id, and record ids are computed and checked before
sending, so nothing collides with a rehearsal record. The live three-tap alignment is shown
in the video, not on stage.
If you have a real deposit story, yours or a friend's with their permission, add one sentence
right after the hands. If you don't, the show of hands carries the opening.
Before you walk on stage
Time
On screen
You say
3:40
Title slide
"To everyone who raised a hand: next
time, your landlord has to prove every
dollar. Your apartment. Its history. Your
proof."
The demo laptop unlocks passkeys with a fingerprint or face, not a PIN. Say "one
touch"; say "Face ID" only on a phone
Display mirrored, not extended, so every passkey prompt shows on the projector;
notifications off
Renter and landlord in two Chrome profiles, one full-screen window each, switched
with Alt+Tab, zoomed for the back row
Every lease screen re-reads contract state every 2 seconds, so the landlord's claims
appear on the renter's screen without a reload
Renter holds at least 400 testnet USDC (or Lease B uses a $100 deposit); Lease A
created with 10-minute windows; Lease B already ended with no claims and refunded
by the keeper

If something breaks live: say "let me show you the recording" and play the full-length
rehearsal recording from that beat's timestamp. Never debug on stage.
MVP scope and cut order
Must work runs live on stage. Must demonstrate is real but may be pre-run or cached on
stage. Stretch has no hours in the schedule and happens only if you finish early. Three
features done beautifully beat eight done halfway.
Scans preloaded; the alignment computed and saved; the AI report cached from a real
run on these scans
Keeper route and its polling script running
Phone hotspot on as Wi-Fi backup
Backup: a full-length recording of a clean Friday rehearsal, with each beat's
timestamp on a card
Rehearsed end to end at least 3 times, under 3:50, with all seven prompts timed
Tier
Feature
Why it earns its hours
Must work
Passkey transactions on Arc, gas
sponsored, through Circle
Modular Wallets
Every seal and payment depends
on it
Must work
3D room with spatial pins, seal, and
Verify (green and red)
The differentiator, and the trust
proof
Must work
Solo start (seal a scan and pins
with no landlord and no deposit)
and a read-only sample apartment
How Keyprint spreads, and what a
judge can try from the link
Must work
Landlord co-sign of the move-in
record
Turns evidence into agreement
Must work
Time slider over the aligned scans
The visual peak
Must work
Priced-pin claims; renter approves
or disputes; landlord withdraws
The mechanic nobody else has
Must work
USDC escrow on Arc: fund, end,
claim, close, settle
Real money moving by rules

The deployed site, README and video aren't features; they're the ticket to being judged
at all.
Pitch it, don't build it: rental résumé sharing, deadline rules for every state, native in-app
LiDAR capture, client-side encryption of scans, insurance partners, landlord tools for
many units, yield on escrowed deposits.
Degrade order when a block slips (first to last):
1. Styled screens become plain ones
2. Explorer links move to the settlement receipt only
3. The live AI call becomes the cached report plus manual "add change"
4. The landlord's review screen becomes a single Co-sign button
Never degrade the escrow, the keeper refund, Seal or Verify. If the during-lease pin isn't
built, don't show one: never seed a pin with a date it wasn't sealed on.
Tier
Feature
Why it earns its hours
Must work
Deadline refund triggered by
Keyprint's keeper (Lease B)
Makes "it comes back to you"
literally true
Must
demonstrate
Alignment with the surface-
agreement gate (saved before
stage, tapped live in the video)
Without a trustworthy line-up,
comparisons mean nothing
Must
demonstrate
AI suggestions, with pin matching
by geometry (cached from a real
run on stage)
Turns evidence into a decision
Stretch
In-app walkthrough recorder
Strengthens the authenticity
answer; scans are sealed without it
Stretch
Side-by-side view, styled lease
timeline, reviewer screen, during-
lease pin, change heatmap
Real value, but not shown in the
demo
Stretch
Headset view (WebXR),
QuickNode Streams feed
No hours in the schedule; only if
you finish early

Architecture
Three layers: the browser captures, hashes and signs; Arc holds fingerprints and money;
private storage holds the files. Nothing that moves money happens offchain, and nothing
private goes onchain.
The browser does the hashing and signing; Circle carries passkey-signed operations to
Arc, the keeper settles at each deadline; Claude only ever suggests.
What lives where
Keyprint architecture · 3 layers
Data
Where
Why
Fingerprints of videos, scans,
pins, alignment and AI reports
Arc, KeyprintRegistry
Anyone can verify; nobody
can edit
Co-signs and contests
Arc, KeyprintRegistry
Agreement is provable
Deposit, claims and payouts
Arc, KeyprintEscrow
holding USDC
Money moves by rules; no
admin key

Stack
Frontend: Next.js (App Router, TypeScript), Tailwind, shadcn/ui, Framer Motion, React
Three Fiber with drei, three-mesh-bvh
Chain: Solidity with Foundry and OpenZeppelin on Arc testnet; viem; Circle Modular
Wallets
Backend: Next.js route handlers on Vercel; Supabase Postgres and Storage; a keeper
route that calls settle with its own server key when a countdown ends
AI: the Anthropic TypeScript SDK with Claude Opus 5.5 and zod
Capture: browser MediaRecorder ; Scaniverse or Polycam for 3D reconstruction; gltf-
transform (the browser recorder only if it ships)
Optional: a QuickNode Arc endpoint for RPC, and Streams for the activity feed
Smart contracts on Arc
Two small contracts with no owner and no upgrade path: KeyprintRegistry seals
evidence (and works with no landlord at all), and KeyprintEscrow holds the USDC
deposit and releases it only through settle .
Data
Where
Why
3D scans, photos (and
walkthrough videos, if
recorded)
Supabase private storage
Homes stay private
Pin text, lease details, cached
AI reports
Supabase Postgres
A fast interface; the chain
stays the source of truth
Passkeys
The user's device
No seed phrase, ever

Every deduction starts as a priced pin, silence is treated the same way for both sides, and
a landlord who files nothing by the deadline keeps nothing. Contracts don't run on their
own, so settle is open to anyone once the rules allow it, and Keyprint's keeper calls it on
time.
// KeyprintRegistry: the evidence log (solo mode needs nothing else)
enum Kind { MoveInScan, Pin, MoveOutScan, Alignment, Report, ClaimEvidence }
struct Record { bytes32 unitId; bytes32 leaseId; Kind kind; bytes32
contentHash; address author; uint64 createdAt; }
mapping(bytes32 => mapping(address => uint64)) public acknowledgedAt;
// co-signs are stored, not only logged
event RecordSealed(bytes32 indexed recordId, bytes32 indexed unitId, bytes32
indexed leaseId, Kind kind, bytes32 contentHash, address author, uint64 at);
event RecordAcknowledged(bytes32 indexed recordId, address indexed by, uint64
at);
event RecordContested(bytes32 indexed recordId, address indexed by, bytes32
noteHash, uint64 at);
// recordId = keccak256(abi.encode(author, contentHash, uint8(kind)));
sealing an existing id reverts
function seal(bytes32 unitId, bytes32 leaseId, Kind kind, bytes32
contentHash) external returns (bytes32 recordId);
Lease and claim lifecycle · KeyprintEscrow

function acknowledge(bytes32 recordId) external;
function contest(bytes32 recordId, bytes32 noteHash) external;
function getRecord(bytes32 recordId) external view returns (Record memory);
// KeyprintEscrow: the deposit, in USDC (0x3600…0000, 6 decimals)
struct LeaseTerms {
    address renter; address reviewer; uint128 deposit; bytes32 unitId; uint64
leaseEnd;
    uint64 reviewWindow; uint64 claimWindow; uint64 responseWindow; uint64
resolveWindow;
}
function createLease(LeaseTerms calldata terms) external returns (bytes32
leaseId);  // landlord
function fund(bytes32 leaseId, bytes32 moveInRecordId) external;
// renter; paying = accepting the terms
function endLease(bytes32 leaseId, bytes32 moveOutRecordId) external;
// renter or landlord, on or after leaseEnd
function fileClaim(bytes32 leaseId, bytes32 evidenceRecordId, uint128 amount)
external returns (uint256 claimId); // landlord
function closeClaims(bytes32 leaseId) external;
// landlord; no claims after this
function withdrawClaim(uint256 claimId) external;
// landlord, unless already accepted
function acceptClaim(uint256 claimId) external;
// renter
function disputeClaim(uint256 claimId) external;
// renter, within responseWindow
function resolveClaim(uint256 claimId, uint128 awarded) external;
// reviewer, within resolveWindow
function settle(bytes32 leaseId) external;
// anyone, once the rules allow; runs once
function withdraw() external;
// collect a payout a transfer couldn't deliver
function getLease(bytes32 leaseId) external view returns (Lease memory);
function getClaims(bytes32 leaseId) external view returns (Claim[] memory);
// at most 20
Rules the escrow enforces
Who can do what. Only the landlord creates a lease and files, closes or withdraws
claims. Only the named renter funds, accepts or disputes. Only the reviewer resolves.
Anyone can call settle .

Valid terms. createLease reverts if the renter is zero or is the landlord; if the
reviewer is zero, the landlord or the renter; if the deposit is zero; or if any window is
shorter than MIN_WINDOW (a constructor setting: 60 seconds on the demo
deployment). A reviewer is required.
Paying is accepting. Every term, including the reviewer, leaseEnd and all four
windows, shows on the renter's terms card before they pay.
Evidence checks. fund needs a MoveInScan sealed by the renter for this lease.
endLease works only on or after leaseEnd , with a MoveOutScan for this lease sealed
by either party after funding. fileClaim needs a ClaimEvidence record sealed by
the landlord, for this lease, after endLease , and not used by another claim.
Amounts. Non-withdrawn claims (counting the claimed amount, not the award) never
add up to more than the deposit. At most 20 claims per lease, each at least 1 USDC. An
award never exceeds its claim. Accounting uses stored amounts only, never the
contract's balance.
Claims close when the claim window passes or the landlord calls closeClaims .
Nothing can be filed after that.
Silence, both ways. An unanswered claim counts as accepted after responseWindow .
An unresolved dispute counts as zero after resolveWindow , so that money goes back
to the renter: the landlord carries the burden of proof. Both are terms the renter sees
before paying, with reminders in the real product, which also needs legal review of
these defaults.
Settlement. settle runs once, only when the lease has ended, claims are closed, and
every claim is final (withdrawn, accepted, unanswered past its response window,
resolved, or unresolved past its resolve window). It pays the landlord accepted plus
awarded amounts and the renter the rest. Nothing pays out before settle .
No frozen money. If a payout transfer fails (USDC's issuer can blocklist addresses),
that amount is credited to owed[address] for withdraw() , so one side can never
freeze the other's money.
Who presses the button. Keyprint's keeper: a plain server key ( KEEPER_KEY , holding
a little faucet USDC for gas) behind POST /api/keeper/settle . When a countdown
reaches zero, the open page calls that route every 2 seconds; it simulates settle and
sends it once the simulation passes. Countdowns use the latest block's timestamp,
not the device clock. A daily Vercel cron is a backstop, and the renter's "Release my
deposit" button is the passkey path. Because settle is open to anyone, the keeper
can only trigger what the rules already allow.

Enforced by the app, not the contract. The move-in review window, the alignment
gate, and what a priced pin contains. The contract can't see a pin's position or price, so
the app reads every claim from the contract ( getClaims ), never the database, and
flags any claim without matching keyprint.claim.v1 evidence as "Not a priced pin"
for the renter and the reviewer.
Security rules
OpenZeppelin SafeERC20 and ReentrancyGuard ; checks, then state changes, then
transfers; custom errors; an event for every state change.
No owner, no pause, no proxy. Nobody, Keyprint included, can move a deposit outside
these rules. Say this on stage.
Pass the terms as the LeaseTerms struct; nine separate arguments can hit Solidity's
stack-too-deep error. Setting via_ir = true in foundry.toml also works.
Windows are lease settings: minutes for the demo, the state's deadline for real leases
(21 days in California).
Amounts always in 6-decimal ERC-20 units; never mixed with the 18-decimal native
gas balance.
Foundry tests (with a 6-decimal mock USDC, in tests only)
Happy path: fund, end, claim, accept, close claims, settle; the split is exact to the unit
No claims: after the window, a stranger's address calls settle and the renter gets
everything
settle reverts right after fund ; after endLease while the claim window is open
(unless closeClaims was called); while any claim isn't final; and a second time
Boundaries: at exactly endedAt + claimWindow , fileClaim succeeds and settle
reverts; one second later, the reverse. The same for the response and resolve
windows
fileClaim reverts for: anyone but the landlord; before endLease , after the window,
or after closeClaims ; evidence of the wrong kind, sealed by the renter, from another
lease, sealed before move-out, or already used; under 1 USDC; a 21st claim; an amount
that pushes non-withdrawn claims past the deposit
endLease reverts before leaseEnd , for a stranger, a second time, or with a move-out
record sealed before funding
createLease and fund revert on every bad input in the rules above
resolveClaim reverts for anyone but the reviewer, after the resolve window, on a
claim that isn't disputed, or for an award above the claim

Deploy to Arc testnet
# Run in Git Bash or WSL, not PowerShell. The last argument is MIN_WINDOW in
seconds.
forge build && forge test -vv
forge create src/KeyprintRegistry.sol:KeyprintRegistry --rpc-url $ARC_RPC --
private-key $DEPLOYER_KEY --broadcast
forge create src/KeyprintEscrow.sol:KeyprintEscrow --rpc-url $ARC_RPC --
private-key $DEPLOYER_KEY --broadcast \
  --constructor-args 0x3600000000000000000000000000000000000000
$REGISTRY_ADDRESS 60
Paste both addresses into the README's contract table with explorer links the moment
they deploy. Then run one scripted lease on Arc testnet (fund, claim, settle) and put those
transaction links in the README too. Nothing counts as working until it has run on Arc
testnet.
Evidence pipeline: capture, seal, verify
Every piece of evidence becomes one small manifest whose SHA-256 fingerprint is sealed
onchain; the files themselves stay private. The block time, not the phone's clock, is the
official timestamp.
1. Capture inside Keyprint (Stretch: the first one to build if you're ahead)
Silence: an unanswered claim counts as accepted; an unresolved dispute pays the
renter
A withdrawn claim pays nothing; the landlord can't withdraw an accepted claim; every
claim function reverts after settlement
Isolation: with two leases in one escrow, settling one never moves the other's money;
USDC sent to the escrow by a stranger changes no payout
A payout to an address that rejects transfers lands in owed , and the other side is still
paid
The recordId computed in TypeScript with viem's encodeAbiParameters matches
the contract's
Fuzz and invariants: payouts never exceed the deposit and always sum to it; the
escrow's balance always covers funded, unsettled deposits plus owed

The /capture page opens the rear camera with getUserMedia({ video: {
facingMode: "environment", width: 1280 } }) and records with MediaRecorder
at about 2.5 Mbps, so a 2-minute walkthrough stays near 40 MB.
A guided overlay prompts each pass: "Pan slowly across the floor," "Now the walls,"
"Close-up of anything already damaged."
No uploads from the camera roll for walkthroughs. That is what makes "captured in
Keyprint" a true claim. Without the recorder, the imported scan is still fingerprinted
and sealed the moment it's added; just don't say "captured in Keyprint."
When recording stops, hash the video in chunks with hash-wasm ( createSHA256() ,
then update() per chunk from blob.stream() ), so a large file never sits in memory
at once.
2. Add the 3D scan
The renter imports the .glb exported from Scaniverse or Polycam. Run gltf-
transform optimize first and import the optimized file: the sealed file is the only
model anyone loads, pins on or verifies. Hash it the same way.
Be honest in the README: the 3D model comes from the scanning app's own capture.
A walkthrough video, when recorded, is a separate raw recording from the same
session.
3. Build the manifest and seal it
{
  "type": "keyprint.evidence.v1",
  "leaseId": "0x…",
  "unitId": "0x…",
  "kind": "MoveInScan",
  "files": [
    { "role": "model", "sha256": "…", "bytes": 18440012, "mime": "model/gltf-
binary" },
    { "role": "photo", "sha256": "…", "bytes": 2210450, "mime": "image/jpeg"
}
  ],
  "capturedAtClient": "2026-11-19T18:41:07-06:00",
  "app": "keyprint-web/0.1"
}
If the recorder ships, the walkthrough video is one more entry in files . Every manifest,
alignment and report manifests included, carries the lease id, so each lease's record ids
are unique.

Canonicalize the JSON (RFC 8785, the canonicalize npm package), hash it, and seal
that 32-byte hash with KeyprintRegistry.seal(unitId, leaseId, kind,
contentHash) . Store those exact canonical bytes as manifest.json ; never rebuild a
manifest from database columns.
The seal is a gas-sponsored user operation signed with a passkey (Face ID on a phone,
Windows Hello on a laptop). One onchain write covers the model, the video and any
photos.
Compute each recordId in the browser: keccak256(abi.encode(author,
contentHash, uint8(kind))) , via viem's encodeAbiParameters . Before sealing, call
getRecord and skip ids that already exist; after a failed or timed-out send, check
again and treat "exists" as sealed. One duplicate would revert a whole batch.
Save each seal's transaction hash. The timeline and the Verify page take block
numbers and explorer links from that receipt, never from scanning logs: Arc's blocks
are fast, and providers cap log queries.
Upload files straight from the browser to storage with signed upload URLs. Never
route them through a Vercel function, which caps request bodies at about 4.5 MB.
4. Pins are evidence too
A pin is {type: "keyprint.pin.v1", leaseId, scanRecordId, position: [x, y,
z], normal: [x, y, z], text, photoSha256, author} , in the move-in scan's own
coordinates. It is canonicalized, hashed and sealed (kind Pin ).
A pin counts as a move-in pin only if it was sealed within the review window after the
move-in record (7 days by default, solo mode too) or the landlord co-signed it. Later
pins show as "Pinned during the lease, Mar 12" or "Pinned at move-out" and never
count as move-in evidence.
A claim is {type: "keyprint.claim.v1", leaseId, alignmentRecordId, position,
normal, amount, title, photoSha256} , with the amount as a string in 6-decimal
units. It is sealed as ClaimEvidence in the same operation as its fileClaim .
The AI report and the alignment matrix are sealed the same way (kinds Report and
Alignment ). The matrix is labeled "maps move-out coordinates to move-in
coordinates."
5. Co-sign or contest
The landlord opens the move-in record and calls acknowledge(recordId) for the
manifest and every move-in pin, in one batched user operation. Co-signs are stored
onchain per account, so the app reads them directly.

To dispute a pin, the landlord seals a counter-pin and calls contest(recordId,
noteHash) . After the review window, silence counts as acceptance.
6. Storage and privacy
Files live in a private Supabase Storage bucket; only the lease's parties get short-lived
signed URLs. Postgres holds an index of leases, records, pins and claims. The chain is
the source of truth for fingerprints and money: claims, amounts and deadlines are
always read from the contract, and the database is only a cache.
Never IPFS: the inside of someone's home should never be public. Client-side
encryption before upload is the production next step.
Supabase's free plan caps uploads at 50 MB per file, so keep the recorder bitrate and
the optimized .glb under that.
7. The Verify page: "Don't trust Keyprint. Verify it."
/verify is public, with no login. Drop in any file or open a record link.
In the browser, it checks four things: the file's SHA-256 is listed in the manifest; the
SHA-256 of the manifest bytes equals getRecord(recordId).contentHash ; the
recordId matches its author, and that author is the lease's renter or landlord in
KeyprintEscrow ; and the record's lease and kind match the manifest. The file never
leaves the device.
Green: "Matches the record sealed Nov 19, 2026, 6:41 PM CST, block 1,234,567, by the
renter," adding "co-signed by the landlord" only when acknowledgedAt shows that
lease's landlord. Solo records say "sealed by this account," never "co-signed."
Red: "This file does not match any sealed record." Keep a copy of a scan with a single
byte changed: dropping it in and watching it fail is the best answer to "couldn't
someone fake it?"
Every lease has a "Download my evidence" button (files plus manifests), so either side
can verify without Keyprint.
3D comparison engine
The hero moment is dragging one slider across a real room and watching the same wall
change from move-in to move-out. Everything here serves that, and the hardest part is
lining up two scans that were made a year apart.

Stack: three.js with @react-three/fiber and @react-three/drei ( useGLTF ,
CameraControls , Html ), plus three-mesh-bvh for fast raycasts and closest-point
queries.
1. Load scans fast
Shrink every scan before importing it: npx @gltf-transform/cli optimize in.glb
out.glb --texture-compress webp , aiming under 20 MB. Seal and use only the
optimized file.
Never move or re-center the model. Frame it with CameraControls.fitToBox , so
world coordinates stay the file's own coordinates. Show load progress and cap the
pixel ratio at 1.5.
2. Spatial pins
A tap gives the hit point in world space ( e.point ), but e.face.normal is in the
mesh's local space: store
e.face.normal.clone().transformDirection(e.object.matrixWorld) . Pins live in
the move-in scan's own coordinates.
Draw pins as small spheres with an Html label. Color carries meaning, always paired
with an icon: renter pins blue, landlord pins violet, AI suggestions amber, claims red,
sealed items a green check.
3. Three-point alignment (the hard part)
Two separate phone scans never share an origin or orientation. Without alignment, "the
same wall" is in two different places.
Prototype this first. On Wednesday night, before any app screens, line up two real scans
of the same room in a bare three.js page. If they can't pass the gate below, fix that before
building anything else.
Show both scans side by side. The user taps the same 4 distinctive points in each, on
at least two different walls: a door corner, an outlet, a window edge. Reject taps that
nearly form a line (their RMS distance from a best-fit line under 20 cm).
Solve for the scale, rotation and translation that map the move-out points onto the
move-in points (the Umeyama method):
\min_{s,R,t} \sum_i \lVert q_i - (s R p_i + t) \rVert^2, \quad \Sigma = U D
V^\top,\; R = U S V^\top,\; S = \mathrm{diag}(1, 1, \det(U V^\top)),\; s =
\frac{\mathrm{tr}(D S)}{\sigma_p^2},\; t = \bar{q} - s R \bar{p}

Here p are the move-out points and q the move-in points, with Σ = (1/n) Σᵢ (qᵢ − q̄)(pᵢ −
p̄)ᵀ and σ_p² = (1/n) Σᵢ ‖pᵢ − p̄‖². Swapping that order silently returns the inverse
rotation, so unit-test the solver first: apply a random scale, rotation and translation to
4 points and check it recovers exactly that transform. Use ml-matrix for the 3x3
SVD.
Sanity checks: the final LiDAR scans are metric and gravity-aligned, so a solved scale
outside 0.98–1.02, or a floor tilted more than 1°, means a wrong tap; ask again. On the
iPhone 13 test scans, measure a door width first to confirm the units are meters.
The readout and the gate measure surface agreement, not tap error. Sample about
5,000 aligned move-out vertices, find each one's closest point on the move-in mesh
with three-mesh-bvh , and report the median gap among those under 10 cm plus the
share under 5 cm ("Half the room lines up within 1.4 cm; 82% within 5 cm"). Start the
gate at a median under 2 cm and at least 60% within 5 cm, then tune it on your real
scans. Moved furniture only lowers the share.
Below the gate, Keyprint asks for new taps, and the app keeps the AI report and
claims locked for that comparison.
Seal the 4x4 matrix as an Alignment record, labeled "maps move-out coordinates to
move-in coordinates," so the comparison anyone sees is reproducible.
Optional refinement (Stretch): a few ICP passes using three-mesh-bvh closest
points on sampled vertices.
4. Compare: three views
Time slider (hero). One camera, two render passes split with a scissor rectangle. In a
useFrame callback with priority 1 (you call gl.render yourself), draw only the move-
in scan from the left edge to the handle, then only the aligned move-out scan from the
handle to the right edge ( gl.setScissorTest(true) , gl.setScissor ). The split sits
exactly on the handle at every angle, and no materials change. Label the handle
"Move-in Nov 19" and "Move-out".
Side by side. The same render loop with two half-width viewports sharing one
camera, for close inspection of a single spot.
Fly to pin. Selecting a claim or AI change moves the camera to it
( CameraControls.setLookAt ) and shows matching before and after crops.
5. Change heatmap (Stretch)
For sampled move-out vertices, measure the distance to the move-in mesh with
three-mesh-bvh and color anything past about 3 cm. It catches dents, holes and
missing fixtures; stains and color changes are the AI's job. The alignment gate already

computes these distances, so this is mostly coloring.
6. Headset (Stretch: no hours in the schedule)
The same React scene can open in a VR headset through WebXR with @react-
three/xr . Build it only if you finish early, and check its current docs before wiring it.
AI change report
Claude compares matching before-and-after renders and suggests what changed; your
code, not the model, matches changes to move-in pins; people decide what is chargeable.
Expect roughly $0.10 per report.
1. Pick the viewpoints
One view per move-in pin: the camera 1.2 m out along the pin's normal, looking at it.
Six to eight coverage views the renter saves while orbiting ("Add view"), or an
automatic ring at eye height.
One view per claim pin, added when the landlord files it.
2. Render matching pairs
Render each view twice, before and after, from one dedicated 4:3 camera into an
offscreen render target at 1024x768. Pixels read back from a render target come out
bottom-up, so flip the rows before encoding the JPEG (quality 0.85).
Use at most 12 views. Upload each render with a signed upload URL and send
/api/analyze only the file paths; the route downloads them and builds the image
blocks, which keeps requests far under Vercel's 4.5 MB body cap.
Send each visible move-in pin as an id and its 2D position in pixels (computed with
that same camera), never its note or co-sign status, so neither side's words can steer
the model.
3. Call Claude from a server route
/api/analyze keeps ANTHROPIC_API_KEY on the server. Use structured outputs so the
response always parses:
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
export const maxDuration = 300; // seconds; set the most your Vercel plan

allows
const Change = z.object({
  view_id: z.string(),
  box: z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number()
}), // pixels in the 1024x768 AFTER image, origin top-left, y down
  title: z.string(), // "Dark stain on carpet"
  description: z.string(),
  category: z.enum(["possible_damage", "possible_wear",
"not_a_real_change"]), // suggestions, never verdicts
  confidence: z.enum(["low", "medium", "high"]),
});
const ChangeReport = z.object({ changes: z.array(Change) });
const client = new Anthropic();
export async function analyze(pairs: Pair[]) {
  const content = pairs.flatMap((p) => [
    { type: "text" as const, text: `View ${p.viewId}. Move-in pins (id, x, y
in pixels): ${JSON.stringify(p.pins)}. BEFORE:` },
    { type: "image" as const, source: { type: "base64" as const, media_type:
"image/jpeg" as const, data: p.before } },
    { type: "text" as const, text: "AFTER:" },
    { type: "image" as const, source: { type: "base64" as const, media_type:
"image/jpeg" as const, data: p.after } },
  ]);
  try {
    const response = await client.messages.parse({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      system: SYSTEM_PROMPT,
      output_config: { effort: "high", format: zodOutputFormat(ChangeReport)
},
      messages: [{ role: "user", content }],
    });
    if (response.stop_reason === "refusal" || !response.parsed_output) return
null; // fall back to the cache, then manual mode
    return response.parsed_output;
  } catch (err) {
    console.error("analyze failed", err); // network, 429 and 5xx errors land

here; same fallback
    return null;
  }
}
System prompt, in substance: you see two renders of the same room from the same
camera, BEFORE (move-in) and AFTER (move-out). List physical changes to the unit.
Ignore lighting, exposure, color balance, scan noise, holes or stretched textures in the
reconstruction, and personal belongings that moved. Label each change possible damage
(holes, burns, large stains, broken fixtures, deep gouges), possibly normal wear (light
scuffs, faded paint, carpet wear in walkways, small nail holes), or not a real change (likely a
scan artifact). These are suggestions for people to review, not findings. Never estimate
costs. Use low confidence when unsure.
4. Match changes to move-in pins in code, not in the model
Raycast through each box's center into the aligned move-out mesh. It already carries
the alignment transform, so the hit is in move-in coordinates: never apply the inverse.
Convert the box from pixels (origin top-left, y down) to NDC as (2u − 1, 1 − 2v), using
that view's camera.
A change matches a move-in pin if the pin's 2D position falls inside the box (grown by
10%) or the 3D hit lands within 15 cm of it. Only pins that count as move-in pins
(sealed within the review window, or co-signed) can match.
A match is shown as "Matches a move-in pin sealed Nov 19, co-signed by the landlord."
It flags possible pre-existing damage; people still decide.
Claim pins use the same matcher: a claim on or near a move-in pin shows that pin on
its claim card.
Merge changes from different views whose 3D points fall within 10 cm. Hide "not a
real change" items behind a "Show filtered" toggle.
5. Guardrails
Every item is labeled "AI suggestion" with "Looks right" and "Dismiss" buttons. The AI
never sets a dollar amount and never moves money.
Seal a hash of the final report (kind Report ), so nobody can edit what the AI said
after the fact.
Whether something is chargeable is always a human decision. Wear-and-tear rules
vary by state, and the labels are suggestions, not legal findings.
6. Make it demo-proof

Cache each report under the move-in record id, the move-out record id, the view ids
and the prompt version, never under image bytes: a live re-alignment changes every
render. On stage, the sealed report from the rehearsal run on these same scans loads
instantly; a fresh run is optional.
If the call errors, refuses or returns nothing, fall back to the cache, then to manual
mode where people pin changes themselves.
Optional: Claude's server-side refusal fallback beta ( fallbacks: "default" ) can
retry a refused request on another model automatically; for a benign image
comparison, the guard above is enough.
Invisible crypto: wallets, gas and USDC on Arc
Users sign in with a passkey (Face ID or fingerprint), see only dollars, and never pay or see
gas. Circle Modular Wallets give each person a passkey-controlled smart account on Arc
testnet, and Circle sponsors testnet gas automatically.
Network facts (from Arc's and Circle's docs)
Console setup (15 minutes, Wednesday night)
Item
Value
Network
Arc Testnet, chain ID 5042002
RPC
https://rpc.testnet.arc.io , or a QuickNode
Arc testnet endpoint for reliability
Explorer
https://explorer.testnet.arc.io (older docs
list testnet.arcscan.app ; use whichever
resolves)
USDC, ERC-20 interface
0x3600000000000000000000000000000000000000 ,
6 decimals
Gas token
Native USDC, 18 decimals. Same balance as the
ERC-20; never mix the units
Testnet USDC
faucet.circle.com and the Circle Developer Console
faucet
Wallet SDK
@circle-fin/modular-wallets-core with viem
( arcTestnet from viem/chains ); Node 22+

1. Circle Console → Keys → Create a key → Client Key.
2. Wallets → Modular Wallets → Passkey: set the passkey domain to the app's domain.
Passkeys are bound to one domain, so make one key for localhost and one for the
Vercel domain. Passkeys and the camera need HTTPS, so test on the phone only
through the deployed URL.
3. Put the key in NEXT_PUBLIC_CIRCLE_CLIENT_KEY . The client URL is the same for every
app.
Sign in and move money: the whole pattern
import { toPasskeyTransport, toWebAuthnCredential, WebAuthnMode,
toModularTransport, toCircleSmartAccount } from "@circle-fin/modular-wallets-
core";
import { createPublicClient, encodeFunctionData, erc20Abi, parseUnits } from
"viem";
import { createBundlerClient, toWebAuthnAccount } from "viem/account-
abstraction";
import { arcTestnet } from "viem/chains";
const clientUrl = "https://modular-sdk.circle.com/v1/rpc/w3s/buidl";
const clientKey = process.env.NEXT_PUBLIC_CIRCLE_CLIENT_KEY!;
// One passkey prompt (Face ID or fingerprint) creates or unlocks the key
that owns the smart account
const credential = await toWebAuthnCredential({
  transport: toPasskeyTransport(clientUrl, clientKey),
  mode: WebAuthnMode.Register, // WebAuthnMode.Login for returning users
  username,
});
const transport = toModularTransport(`${clientUrl}/arcTestnet`, clientKey);
const client = createPublicClient({ chain: arcTestnet, transport });
const account = await toCircleSmartAccount({ client, owner:
toWebAuthnAccount({ credential }) });
const bundler = createBundlerClient({ account, chain: arcTestnet, transport
});
// Renter pays the deposit: approve + fund in one atomic, gas-sponsored
operation
const amount = parseUnits("200", 6); // ERC-20 USDC uses 6 decimals
const hash = await bundler.sendUserOperation({
  calls: [
    { to: USDC, data: encodeFunctionData({ abi: erc20Abi, functionName:

"approve", args: [ESCROW, amount] }) },
    { to: ESCROW, data: encodeFunctionData({ abi: escrowAbi, functionName:
"fund", args: [leaseId, moveInRecordId] }) },
  ],
  paymaster: true,
});
const { receipt } = await bundler.waitForUserOperationReceipt({ hash });
Every seal, co-sign, claim and passkey settlement uses this same sendUserOperation
shape. Batch related calls into one operation so the user sees one passkey prompt.
Before building any screen, run one full lease (fund, claim, settle) this way on Arc
testnet.
Persist the credential (Circle's example app keeps it in localStorage ) and use
WebAuthnMode.Login on return visits. Two windows in one browser profile share that
storage, so use two Chrome profiles for the renter and the landlord.
The smart account's address is the identity onchain: it is msg.sender in your
contracts.
Testnet USDC plan
Faucet amounts differ by source (commonly 20 USDC per request); check
faucet.circle.com itself. The Developer Console faucet is documented at 20 USDC per
request, ten requests per 24 hours.
On Wednesday night, also ask Circle's team (office hours or their Discord) for a larger
testnet allocation. Target about 600 USDC across the demo accounts: two leases on
stage plus the iPhone renter for the video.
Rehearsals recycle money: after each settlement, the landlord account sends its
share back to the renter.
The Foundry deployer is a plain key that also needs a little faucet USDC, since Arc gas
is paid in USDC.
Words users never see on main screens: wallet, gas, transaction, blockchain, sign
message, or any 0x string. Use Seal, Protected, Proof and Verify. Addresses and explorer
links live in a Details drawer.

Screens and UX polish
Twelve screens, renter-first and phone-first, most of them sharing the same 3D
components. Every one of them should look like a shipped product. Spend the polish on
the four moments the demo shows: seal, compare, claim, settle.
Screen
Route
Who
What makes it feel real
Landing
/
Everyone
One line, "Your apartment. Its history.
Your proof.", and two buttons: "Protect
my deposit" and "See a sample
apartment"
Sign in
/start
Everyone
One passkey prompt (Face ID or
fingerprint), a name field, no crypto
words anywhere
Home
/home
Renter
Deposit card ("$200 protected"), each
lease, and its countdown when one is
running
Solo
start
/unit/new
Renter
Name the unit, import the scan, pin
existing damage, Seal: no landlord, no
deposit, no USDC needed
Capture
/lease/[id]/capture
Renter
Scan import, pins on existing damage, the
terms card (deposit, every deadline, the
reviewer), then Seal & pay; guided
walkthrough prompts if the recorder
ships
Room
/lease/[id]/room
Both
The 3D room, pins with labels and seal
dates, tap-to-pin
Review
/lease/[id]/review
Landlord
Co-sign everything, or contest one pin
with a counter-note
Compare
/lease/[id]/compare
Both
The alignment readout, the time slider, AI
suggestion cards
Claims
/lease/[id]/claims
Both
Landlord drops priced pins; renter
approves or disputes each line beside
the move-in view; claims without a priced
pin are flagged

Design system
Next.js with Tailwind, shadcn/ui components, lucide icons and Framer Motion.
One typeface (Inter or Geist), a warm off-white background, ink-dark text and one
accent color. Status colors carry meaning only: green sealed or verified, amber AI
suggestion, red claim.
Pin colors always come with an icon, so color is never the only signal.
Micro-interactions worth the time
Seal: a fingerprint ring fills, then "Sealed ✓ Nov 19, 6:41 PM" with a Verify chip.
Countdown: large digits, minutes and seconds under an hour: "Your landlord has 4:59
to file claims. When it hits zero, your $200 comes back." A Release my deposit button
appears at zero in case anything is slow.
Time slider: a draggable handle labeled with both dates; the split stays exactly under
the handle as the room rotates.
Claim drop: the pin lands with a soft bounce and a price tag.
Settlement: both amounts count up to their final values. No confetti.
Live updates: every lease screen re-reads contract state every 2 seconds, so the
other side's actions appear without a reload.
Loading: a 3D skeleton with a percentage while scans stream in.
Copy rules
Say Seal, Protected, Proof, Verify. Say "your landlord co-signed this," not
"acknowledged onchain."
Screen
Route
Who
What makes it feel real
Settle
/lease/[id]/settle
Both
The split animation, a receipt with
explorer links, and the lease's network
fees in USDC
Verify
/verify
Anyone
Drag a file in: green "Matches" or red "No
match"
Sample
/sample
Anyone
A read-only sealed lease: the room and
pins, the slider, the AI suggestions, the
settled split, and both sample files to try
in Verify

Every AI item says "AI suggestion." Every dollar amount on screen is the real onchain
amount.
Plain-language empty states, such as "No pins yet. Tap anything that's already
damaged."
Build schedule
About 28 working hours before the deadline and 11 hours of sleep. A checkpoint only
counts when it works on Arc testnet or the deployed site, and rehearsal happens Friday
afternoon, after the code freeze.
Wednesday night proves the wallet on the deployed domain and the alignment; Thursday
builds everything the demo shows; Friday morning is a buffer, then the video and docs.
Checkpoints
Build schedule · Wed 8 PM to Fri noon, Central time
Wed 11 PM: the app skeleton is live on Vercel, and a passkey account there sends a
sponsored transaction on Arc testnet (otherwise switch to the wallet fallback now)

Final scan session (Thu 5–6:30 PM, laptop in the room)
Stage damage a scan can see: a dark stain at least 20 cm across on a light surface, and
scuffs at shin height. The desk scratch exists before move-in and appears in its pin
photo.
Scan move-in twice, stage the damage, scan move-out twice, and export all four as
.glb .
Before handing the phone back, load both scans on the deployed site, pass the
alignment gate once, and look at the stain from 1.2 m in a render. If it isn't obvious to
you, the AI won't see it either: make it bigger and rescan move-out. Keep the phone
until the 9 PM checkpoint if the owner allows.
Disclose it plainly in the README and the video: both scans were made the same
evening in one room, with the damage staged between them.
Sleep is in the plan on purpose: a rested, smooth demo is worth more than one more
feature.
Wed 11 PM: a usable iPhone 13 test scan, exported as .glb and uploaded to Supabase
with a signed URL
Wed night: post a two-question deposit poll, so real numbers exist by Friday
Thu 2 AM: two real scans pass the surface-agreement gate in a bare three.js page
Thu 12 PM: one full lease (fund, claim, close, settle) runs on Arc testnet through
passkey accounts
Thu 3 PM: solo seal, pins and landlord co-sign work; Verify shows green and red
Thu 5 PM: the compare page renders pairs from the iPhone 13 scans and gets a parsed
report back from Claude
Thu 6:30 PM: final LiDAR scans done and checked before the phone goes back (see
below)
Thu 9 PM: the AI flags the stain and the scuffs on the real scans, and nothing on the
unchanged scratch
Fri 1 AM: claims, dispute, withdraw, settle and the keeper work; Lease A and Lease B
run end to end on the deployed site, screen-recorded for the video
Fri 8 AM: whatever the 1 AM run broke is fixed; only the demo screens got polish
Fri 10 AM: voiceover, captions, README and Devpost done from the drafts
Fri 11 AM: submitted; code frozen. Saturday's demo runs this commit
Fri afternoon: the full-length backup recorded; three rehearsals under 3:50

Risks and fallbacks
Kill the two biggest risks on Wednesday night: passkey wallets on Arc, and getting usable
scans. Everything else has a fallback that still demos well.
Risk
Early warning
Fallback
Decide by
Passkey wallets fail on
Arc or the domain
setup fights you
No sponsored test
transfer by 11 PM
Wed
Circle developer-
controlled wallets, or
server-held viem
accounts per role; say
"custodial for the demo"
in the README and on
stage, and drop the "not
even we can take it" line
Wed 11 PM
Not enough testnet
USDC
Faucet limits hit
Developer Console
faucet, ask Circle for an
allocation, recycle funds
between rehearsals
Thu noon
Phone scans look bad
Holes or blobs on
the iPhone 13 test
Scan a textured corner;
use the borrowed Pro's
LiDAR for final scans; try
Scaniverse or Polycam
Space Mode
Wed night
The .glb export is
paywalled
Export button
locked
Scaniverse (free mesh
export to GLB per its
App Store listing) or
Polycam LiDAR mode
(GLTF/GLB on free)
Wed night
Scan files too big for
the browser or storage
Over 20 MB, slow
loads
gltf-transform
optimize with WebP
textures; lower recorder
bitrate
Thu morning
Alignment is visibly off
Surface agreement
fails the gate
Re-tap 4 points on two
walls, check the scale
and floor tilt, and use the
alignment saved in
rehearsal on stage
Thu 2 AM
(prototype)

Rules: commit to GitHub every hour (judges check that the repo was built during the
hackathon), never start a Stretch item before the Friday 1 AM checkpoint, and never call
anything done until it has run on Arc testnet or the deployed site.
Risk
Early warning
Fallback
Decide by
AI flags noise or
misses the stain
False items on test
scans
Tune the prompt on your
real scans, raise the
confidence bar, merge
duplicates, keep manual
"add change"
Thu 9 PM
Claude is slow or down
on stage
Over 20 seconds
The sealed report
cached from rehearsal,
keyed by record and
view ids
Demo day
Venue Wi-Fi fails
Slow page loads at
the venue
Phone hotspot; load
every page before going
on stage; backup video
Demo day
Arc RPC is slow
Seals take more
than a few seconds
A QuickNode endpoint
helps reads only; user
operations go through
Circle, so pre-run
anything slow and time
all seven prompts in
rehearsal
Thu night
Passkey prompt fails
on the stage laptop
Sign-in errors
Sign both roles in on that
exact laptop beforehand,
in two browser profiles
Fri morning
A contract bug strands
funds
Failing Foundry
tests
Short demo windows, a
redeploy script, fresh
lease per rehearsal; no
upgradability to exploit
Thu night
You run out of time
Behind a
checkpoint
Follow the degrade
order in the MVP section
Every
checkpoint

Judge Q&A prep
Two minutes of questions decide close calls. Answer in under 20 seconds, admit limits
plainly, and show the product instead of describing it whenever you can. If you're building
solo, say "I" instead of "we," on stage too.
If a judge asks
Answer
Couldn't someone fake a scan?
Every file is fingerprinted and sealed the
moment it's added, and the landlord co-signs
or contests it within the review window. Any
later edit fails Verify: drop in the one-byte-
edited file and let them watch. Honest limit: a
scanning app builds the 3D model; in-app
capture with device attestation is next.
Does Verify trust your database?
No. Your browser re-hashes the manifest and
checks it against the fingerprint on Arc, so
our database can fail to find a match but
can't fake one.
Why a blockchain and not a database?
Neither side should control the evidence or
the money. Whoever runs a database can
edit or freeze it. Our escrow has no admin
key: not even Keyprint can move a deposit.
Is the refund really automatic?
Contracts don't run on their own. Once the
deadline passes, anyone can trigger
settlement; Keyprint's keeper does it at zero,
and the renter has a one-tap Release button.
You saw it on Lease B: the refund came from
the keeper's address. If we disappeared,
anyone could still do it.
Can a landlord skip the pin by calling the
contract directly?
They can file, but only with their own sealed
evidence filed after move-out, and a claim
without a priced pin shows up flagged next
to Dispute. If the reviewer doesn't rule, the
money goes back to the renter. Checking the
pin onchain is next.

If a judge asks
Answer
Can the renter add "already here" pins
later?
They can pin anytime, but the seal time is
onchain, and only pins from the move-in
window or co-signed by the landlord count
as move-in evidence.
What if the AI is wrong?
It only suggests and never prices anything.
Matches to move-in pins come from
geometry, and people decide what's
chargeable.
Was that AI live?
It ran on these exact scans earlier today, and
its report is sealed, so you can check nobody
edited it.
Why would a landlord agree to this?
Solo mode doesn't need them. For landlords
who join: California already requires move-in
and move-out photos, they get paid for real
damage in seconds, and they avoid small-
claims fights.
Isn't scanning my home a privacy risk?
Scans are never public. Only fingerprints go
onchain; files sit in private storage shared
only with the lease's parties, and encryption
before upload is next.
If Keyprint shuts down, where are my
scans?
The originals came from your phone, and you
can download every file. The fingerprints and
the deposit are on Arc, so any copy still
verifies and anyone can still settle.
How is this different from Matterport or
Paraspot?
They document for the landlord. We change
who holds the money and who has to prove
the damage: every deduction is a pin with a
price.
Why not just email myself photos?
That proves you had photos. It doesn't prove
your landlord agreed, it doesn't hold the
money, and it doesn't make them price each
claim.

If a judge asks
Answer
Deposit laws differ by state.
Every deadline is a lease setting. Real leases
use the state's deadline, like California's 21
days; the demo uses minutes so you can
watch it. Keyprint supports your evidence; it
doesn't replace a court.
Is holding a deposit in USDC legal?
I haven't checked it state by state, and some
states regulate where deposits are held.
That's why solo mode needs no escrow, and
why full mode needs legal review before
launch.
Who is the reviewer? Can the landlord pick
a friend?
The landlord proposes one, but the renter
sees it on the terms card before paying, and
paying means accepting it. The contract
rejects the landlord or renter as reviewer,
and a reviewer who misses its deadline
defaults the disputed amount to the renter.
What if the renter never responds to a
claim?
It counts as accepted after the response
window, a lease term the renter sees before
paying; the real product adds reminders. The
landlord's silence costs them too: no claims
means a full refund. Both defaults need legal
review.
Does the renter need crypto?
They need dollars in USDC. On testnet that's
a faucet; for real renters it's a card, or USDC
from any chain through Circle. Either way
they never see a wallet, gas or a seed phrase.
What exactly is onchain?
Fingerprints of every scan, pin, alignment
and AI report; co-signs and contests; the
deposit, every claim and every payout.

Submission kit
Everything the judges read before they ever see you: the README, the Devpost answers
and the video. Drafts are below; replace anything you didn't actually build.
README outline
1. Keyprint in one paragraph, with the live demo link and the video link
If a judge asks
Answer
Why Arc?
Deposits are dollars, and on Arc the fees are
dollars too. A full lease took [N] transactions
and [cost] in USDC gas, which Circle
sponsors on testnet and Keyprint would pay
in production, so a move-out has a known
cost. Circle's passkey wallets and gas
sponsorship keep all of it invisible. Fill in [N]
and [cost] from your own receipts.
How do you measure the line-up?
The typical gap between the two aligned
surfaces, sampled across the room: on my
LiDAR scans, half the room lined up within
[X] cm. Below the gate, claims stay locked.
How often would I open this?
Move-in, move-out, and whenever something
breaks. It's not a daily app; it's the record
you're glad you kept.
What did you build versus use?
I built the contracts, sealing and Verify,
alignment and comparison, the AI pipeline,
the keeper and every screen. I used a
scanning app for 3D reconstruction, Circle's
wallets and Claude.
How common is this problem?
In a poll I ran this week, [X] of [N] renters lost
part of a deposit; it's a small sample. In this
room, [about half] raised a hand. Quote
Zillow only after opening its report yourself.
What's the business?
Free for renters. Landlords and property
managers pay per move-out; later, insurance
partners and verified listings.

2. Try it in two minutes: the sample apartment, Verify with the two sample files, then
seal your own scan in solo mode
3. The problem and the flip (the Today vs Keyprint table)
4. How it works: the five moments
5. Architecture diagram and what is onchain versus offchain
6. How Keyprint uses Arc (required): a contract table ( KeyprintRegistry ,
KeyprintEscrow , USDC 0x3600000000000000000000000000000000000000 , each
linked to the explorer); transaction links from one full lease (fund, claim, dispute,
withdraw, settle, keeper refund); the measured gas cost in USDC (from each
operation's actualGasCost , 18-decimal native units); and which Circle tool does what
(Modular Wallets for passkey smart accounts, Gas Station sponsorship through
paymaster: true , USDC as both the deposit and the gas token)
7. Escrow design and risk assumptions: review, claim, response and resolve windows;
silence rules both ways; the reviewer's role and deadline; permissionless settlement
and who triggers it; no admin keys; USDC's issuer can blocklist addresses, which
Keyprint can't override (payouts then wait in withdraw )
8. AI: the model, what it sees, what it can and can't decide
9. Privacy and security
10. Setup: Node 22+, Foundry (in Git Bash or WSL), .env.example , install, run, deploy
contracts, seed a demo lease
11. Demo data: both scans were made the same evening in one room, with the damage
staged between them; the on-stage AI report is cached from a real run on those scans
12. What I built vs. used (the Q&A answer, word for word)
13. Honest limitations: a scanning app does the 3D reconstruction; the move-in review
window and the alignment gate are enforced in the app, not the contract; settlement
needs a trigger (Keyprint's keeper, or anyone); no reminders yet; any custodial
fallback; testnet USDC
14. What's next, and the team
Devpost answers (drafts)
What did you build? Keyprint is a renter-owned, tamper-evident 3D history of an
apartment, with a security-deposit escrow on Arc. Renters scan their place at move-
in, pin existing damage in 3D, and seal the record with a passkey. At move-out, a
second scan is lined up with the first and AI suggests what changed. The landlord can
only claim money by pinning and pricing a spot in the 3D record. Once every claim is

final, one settlement pays both sides in USDC, and if the landlord files nothing by the
deadline, Keyprint triggers the full refund the moment the clock runs out. It all runs on
Arc testnet today.
What problem does it solve? Landlords hold both the deposit and the evidence. A
renter who disagrees has to prove a negative or go to small-claims court, so many just
absorb the loss. Keyprint creates evidence neither side can quietly edit and holds
money neither side controls, which flips who has to prove what. Add "In a poll I ran this
week, X of N renters had lost part of a deposit" only with real numbers.
How does it work? A Next.js app fingerprints each 3D scan the moment it's added
and seals a manifest of it (plus the walkthrough video, if recorded in Keyprint) in
KeyprintRegistry on Arc through Circle Modular Wallets, with passkeys and
sponsored gas. Scans are aligned with a similarity transform, checked for surface
agreement, and compared with a time slider in three.js. Claude Opus 5.5 compares
matched renders with structured outputs, and code checks each change for a sealed
move-in pin nearby. KeyprintEscrow holds USDC and enforces claim windows,
evidence-backed claims, disputes with a reviewer deadline, and deadline refunds;
anyone can trigger settlement, and Keyprint's keeper does it at each deadline.
What makes it unique? Every deduction is a pin with a price, tied to an exact spot in a
sealed 3D record. The inspection tools I found are built for landlords and property
managers; Keyprint is neutral, owned by the renter, and works on day one without the
landlord's permission.
What would you build next? A native capture app with device attestation, client-side
encryption of scans, deadline rules for every state, a shareable rental résumé, a
reviewer network, deposits funded by card or with USDC from any chain through
Circle Gateway or CCTP, and a launch on Arc mainnet.
Technologies: Arc, USDC, Circle Modular Wallets with Gas Station sponsorship,
Solidity, Foundry, OpenZeppelin, Next.js, three.js, React Three Fiber, three-mesh-bvh,
Claude Opus 5.5, Supabase, Vercel, Scaniverse or Polycam.
Demo video script (2:40)
Time
Shot
Voiceover
0:00
Text on black: "They kept $120 for a
scratch that was already there."
"Your landlord holds your deposit and
the evidence. To fight a deduction, you
have to sue."

Film the renter on the iPhone 13 with the iOS screen recorder, so the Face ID is real; fund
that account with 200 testnet USDC first. Landlord and compare views come from the
laptop. Record the voiceover separately, turn captions on, upload unlisted to YouTube, and
open the link in a logged-out window to confirm judges can see it.
Final checklist (Friday, done by 11 AM CST)
Time
Shot
Voiceover
0:12
The Today vs Keyprint table
"Keyprint flips that. Your deposit sits in
escrow, and every dollar they keep
needs a pin and a price."
0:25
iPhone screen recording: Face ID sign-in,
pin the scratch, Seal & pay $200, the seal
animation
"At move-in, I pin what's already
damaged. One Face ID seals the record
on Arc and puts my $200 in escrow. No
wallet, no gas, no seed phrase."
0:55
Laptop, landlord view: Co-sign
"My landlord co-signs. Now it's agreed."
1:05
Three-tap alignment and its readout, the
time slider sweep, the AI suggestion
cards. Caption: "Demo scans: same
evening, staged damage"
"At move-out, a few taps line up both
scans. AI suggests what changed;
people decide."
1:35
Priced pins, the dispute on the iPhone,
the evidence panel, the withdrawal
"Every dollar the landlord claims has to
be pinned to a spot. This one was there
at move-in, and they co-signed it."
2:00
The split and its receipt; then Lease B's
clock hitting zero and $200 landing
"$40 for real damage, $160 back to me, in
USDC on Arc, in seconds. And when a
landlord files nothing, Keyprint triggers
the full refund the moment the clock
runs out."
2:20
Verify: the original passes, the one-byte
copy fails
"Anyone can check the evidence.
Change one byte, and it fails."
2:30
Title card with the demo and repo links
"Keyprint. Your apartment. Its history.
Your proof."
Deployed URL works in a fresh incognito window
In that window, a stranger can open the sample apartment, verify both sample files
(one green, one red), and seal a scan in solo mode with their own passkey

Sources
Pages opened while writing this document, as of Nov 18, 2026. Recheck network values
against the live docs before hardcoding them.
Arc docs: Connect to Arc: testnet chain ID, RPC, explorer, USDC gas
Arc docs: Contract addresses: USDC interface at 0x3600…0000 , 6 vs 18 decimals
Circle: Create a modular wallet and send a gasless transaction: passkey setup, client
URL, Arc testnet
Circle: Transfer tokens with modular wallets: sendUserOperation , paymaster: true ,
automatic testnet sponsorship
Bay Area Legal Aid: AB 2801 photo rules: photo duties, 21-day return deadline
Chugh LLP: AB 2801 recording requirements: effective date as reported by the firm
Polycam: Space Mode press release, Jan 14, 2026: free capture on iPhone 13 and
newer, no LiDAR
Sources disagree on AB 2801's effective dates (2025 versus Jan 1, 2026), so the pitch
never states one.
Not opened; check before relying on them: Zillow 2023 renters report (blocked our
fetch; the 42% figure comes from search results), Circle faucet (per-request amount),
QuickNode on Arc (whether Streams covers testnet), Scaniverse on the App Store (free
GLB export, non-LiDAR support).
Repo is public; README complete; .env.example present; no secrets committed
Contract addresses and transaction links in the README match the explorer
Video is 2 to 3 minutes and plays logged out
Devpost: Consumer Apps track, chain award Arc, technologies listed, every team
member added
Submitted, with a screenshot of the confirmation
Saturday kit: charged laptop, hotspot, an offline copy of the full-length backup
recording, arrive early
