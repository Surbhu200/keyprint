/**
 * Runs one real end-to-end lease on Arc Testnet against the deployed
 * KeyprintRegistry and KeyprintEscrow contracts, funds the Keeper account,
 * seals the real reference apartment-move-in.glb manifest (so /verify turns real GREEN
 * on the original and RED on the 1-byte-tampered copy), and prints real tx links + gas costs.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import canonicalize from "canonicalize";
import { createClient } from "@supabase/supabase-js";
import {
  createPublicClient,
  createWalletClient,
  decodeEventLog,
  encodeAbiParameters,
  erc20Abi,
  formatUnits,
  http,
  keccak256,
  parseAbi,
  parseUnits,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arcTestnet } from "viem/chains";

function loadEnvLocal() {
  const txt = fs.readFileSync(".env.local", "utf8");
  const env = {};
  for (const line of txt.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].trim();
  }
  return env;
}

const REGISTRY_ABI = parseAbi([
  "function seal(bytes32 unitId, bytes32 leaseId, uint8 kind, bytes32 contentHash) external returns (bytes32 recordId)",
  "function acknowledge(bytes32 recordId) external",
  "function getRecord(bytes32 recordId) external view returns ((bytes32 unitId, bytes32 leaseId, uint8 kind, bytes32 contentHash, address author, uint64 createdAt, uint64 createdSeq))",
]);

const ESCROW_ABI = parseAbi([
  "function createLease((address renter, address reviewer, uint128 deposit, bytes32 unitId, uint64 leaseEnd, uint64 reviewWindow, uint64 claimWindow, uint64 responseWindow, uint64 resolveWindow) terms) external returns (bytes32 leaseId)",
  "function fund(bytes32 leaseId, bytes32 moveInRecordId) external",
  "function endLease(bytes32 leaseId, bytes32 moveOutRecordId) external",
  "function fileClaim(bytes32 leaseId, bytes32 evidenceRecordId, uint128 amount) external returns (uint256 claimId)",
  "function closeClaims(bytes32 leaseId) external",
  "function acceptClaim(uint256 claimId) external",
  "function settle(bytes32 leaseId) external",
  "function getLease(bytes32 leaseId) external view returns ((bytes32 leaseId, address landlord, address renter, address reviewer, uint128 deposit, bytes32 unitId, uint64 leaseEnd, uint64 reviewWindow, uint64 claimWindow, uint64 responseWindow, uint64 resolveWindow, uint8 state, bytes32 moveInRecordId, bytes32 moveOutRecordId, uint64 fundedAt, uint64 fundedRegistrySeq, uint64 endedAt, uint64 endedRegistrySeq, bool claimsClosed, uint128 activeClaimedTotal, uint128 landlordPayout, uint128 renterPayout))",
  "event LeaseCreated(bytes32 indexed leaseId, address indexed landlord, address indexed renter, address reviewer, uint128 deposit, bytes32 unitId, uint64 leaseEnd)",
  "event ClaimFiled(bytes32 indexed leaseId, uint256 indexed claimId, bytes32 evidenceRecordId, uint128 amount, uint64 filedAt)",
]);

const USDC = "0x3600000000000000000000000000000000000000";
const MIN_FEE = 25_000_000_000n; // 25 Gwei (> Arc 20 Gwei mempool floor)

async function main() {
  const env = loadEnvLocal();
  const rpc = env.ARC_RPC || "https://rpc.testnet.arc.io";
  const registry = env.NEXT_PUBLIC_KEYPRINT_REGISTRY_ADDRESS;
  const escrow = env.NEXT_PUBLIC_KEYPRINT_ESCROW_ADDRESS;

  const landlord = privateKeyToAccount(env.DEPLOYER_KEY);
  const renter = privateKeyToAccount(env.KEEPER_KEY);
  const reviewer = "0xB59A3658D210f3DDbb202d0FbD14373EED43AC3F";

  const pub = createPublicClient({ chain: arcTestnet, transport: http(rpc) });
  const landlordWallet = createWalletClient({
    account: landlord,
    chain: arcTestnet,
    transport: http(rpc),
  });
  const renterWallet = createWalletClient({
    account: renter,
    chain: arcTestnet,
    transport: http(rpc),
  });

  const receipts = [];
  let totalGasWei = 0n;

  async function waitAndRecord(label, hash) {
    const r = await pub.waitForTransactionReceipt({ hash });
    if (r.status !== "success") throw new Error(`${label} reverted (${hash})`);
    const feeWei = r.gasUsed * r.effectiveGasPrice;
    totalGasWei += feeWei;
    receipts.push({
      label,
      hash,
      blockNumber: Number(r.blockNumber),
      gasUsed: r.gasUsed.toString(),
      feeUsdc: Number(formatUnits(feeWei, 18)).toFixed(6),
    });
    console.log(
      `[OK] ${label} | block ${r.blockNumber} | fee $${Number(formatUnits(feeWei, 18)).toFixed(6)} | ${hash}`,
    );
    return r;
  }

  // 0. Fund Keeper/Renter with 5 USDC from Deployer if below 4 USDC
  const keeperBal = await pub.getBalance({ address: renter.address });
  if (keeperBal < parseUnits("4", 18)) {
    const h = await landlordWallet.sendTransaction({
      to: renter.address,
      value: parseUnits("5", 18),
      maxFeePerGas: MIN_FEE,
      maxPriorityFeePerGas: 1_000_000_000n,
    });
    await waitAndRecord("Fund Keeper (5 USDC)", h);
  }

  // 1. Create lease (2 USDC deposit, 60s windows, leaseEnd = now so full flow runs immediately)
  const block = await pub.getBlock({ blockTag: "latest" });
  const unitId = keccak256(new TextEncoder().encode("apt-302-reference-bedroom"));
  const deposit = parseUnits("2", 6); // 2 USDC (6 decimals)

  const createHash = await landlordWallet.writeContract({
    address: escrow,
    abi: ESCROW_ABI,
    functionName: "createLease",
    args: [
      {
        renter: renter.address,
        reviewer,
        deposit,
        unitId,
        leaseEnd: block.timestamp,
        reviewWindow: 60n,
        claimWindow: 60n,
        responseWindow: 60n,
        resolveWindow: 60n,
      },
    ],
    maxFeePerGas: MIN_FEE,
    maxPriorityFeePerGas: 1_000_000_000n,
  });
  const createReceipt = await waitAndRecord("createLease", createHash);
  let leaseId = null;
  for (const log of createReceipt.logs) {
    if (log.address.toLowerCase() !== escrow.toLowerCase()) continue;
    try {
      const ev = decodeEventLog({ abi: ESCROW_ABI, data: log.data, topics: log.topics });
      if (ev.eventName === "LeaseCreated") leaseId = ev.args.leaseId;
    } catch {}
  }
  if (!leaseId) throw new Error("LeaseCreated event not found");

  // 2. Hash real public/models/apartment-move-in.glb and build exact RFC 8785 manifest
  const moveInBuf = fs.readFileSync("public/models/apartment-move-in.glb");
  const moveInSha = crypto.createHash("sha256").update(moveInBuf).digest("hex");
  const moveInManifest = {
    type: "keyprint.evidence.v1",
    leaseId,
    unitId,
    kind: "MoveInScan",
    files: [
      {
        role: "model",
        sha256: moveInSha,
        bytes: moveInBuf.length,
        mime: "model/gltf-binary",
        name: "apartment-move-in.glb",
      },
    ],
    capturedAtClient: new Date().toISOString(),
    app: "keyprint-web/0.1",
  };
  const moveInCanon = canonicalize(moveInManifest);
  const moveInContentHash =
    "0x" + crypto.createHash("sha256").update(moveInCanon).digest("hex");
  const moveInRecordId = keccak256(
    encodeAbiParameters(
      [{ type: "address" }, { type: "bytes32" }, { type: "uint8" }],
      [renter.address, moveInContentHash, 0],
    ),
  );

  const sealInHash = await renterWallet.writeContract({
    address: registry,
    abi: REGISTRY_ABI,
    functionName: "seal",
    args: [unitId, leaseId, 0, moveInContentHash],
    maxFeePerGas: MIN_FEE,
    maxPriorityFeePerGas: 1_000_000_000n,
  });
  const sealInReceipt = await waitAndRecord("seal(MoveInScan)", sealInHash);

  // 3. Approve USDC & fund escrow
  const approveHash = await renterWallet.writeContract({
    address: USDC,
    abi: erc20Abi,
    functionName: "approve",
    args: [escrow, deposit],
    maxFeePerGas: MIN_FEE,
    maxPriorityFeePerGas: 1_000_000_000n,
  });
  await waitAndRecord("USDC.approve(2 USDC)", approveHash);

  const fundHash = await renterWallet.writeContract({
    address: escrow,
    abi: ESCROW_ABI,
    functionName: "fund",
    args: [leaseId, moveInRecordId],
    maxFeePerGas: MIN_FEE,
    maxPriorityFeePerGas: 1_000_000_000n,
  });
  await waitAndRecord("fund(2 USDC)", fundHash);

  // 4. Landlord co-signs move-in record
  const ackHash = await landlordWallet.writeContract({
    address: registry,
    abi: REGISTRY_ABI,
    functionName: "acknowledge",
    args: [moveInRecordId],
    maxFeePerGas: MIN_FEE,
    maxPriorityFeePerGas: 1_000_000_000n,
  });
  await waitAndRecord("acknowledge(MoveInScan co-sign)", ackHash);

  // 5. Seal MoveOutScan & endLease
  const moveOutBuf = fs.readFileSync("public/models/apartment-move-out.glb");
  const moveOutSha = crypto.createHash("sha256").update(moveOutBuf).digest("hex");
  const moveOutManifest = {
    type: "keyprint.evidence.v1",
    leaseId,
    unitId,
    kind: "MoveOutScan",
    files: [
      {
        role: "model",
        sha256: moveOutSha,
        bytes: moveOutBuf.length,
        mime: "model/gltf-binary",
        name: "apartment-move-out.glb",
      },
    ],
    capturedAtClient: new Date().toISOString(),
    app: "keyprint-web/0.1",
  };
  const moveOutCanon = canonicalize(moveOutManifest);
  const moveOutContentHash =
    "0x" + crypto.createHash("sha256").update(moveOutCanon).digest("hex");
  const moveOutRecordId = keccak256(
    encodeAbiParameters(
      [{ type: "address" }, { type: "bytes32" }, { type: "uint8" }],
      [renter.address, moveOutContentHash, 2],
    ),
  );

  const sealOutHash = await renterWallet.writeContract({
    address: registry,
    abi: REGISTRY_ABI,
    functionName: "seal",
    args: [unitId, leaseId, 2, moveOutContentHash],
    maxFeePerGas: MIN_FEE,
    maxPriorityFeePerGas: 1_000_000_000n,
  });
  await waitAndRecord("seal(MoveOutScan)", sealOutHash);

  const endHash = await renterWallet.writeContract({
    address: escrow,
    abi: ESCROW_ABI,
    functionName: "endLease",
    args: [leaseId, moveOutRecordId],
    maxFeePerGas: MIN_FEE,
    maxPriorityFeePerGas: 1_000_000_000n,
  });
  await waitAndRecord("endLease", endHash);

  // 6. Landlord seals ClaimEvidence ($1 carpet stain), files claim, closes claims
  const claimManifest = {
    type: "keyprint.claim.v1",
    leaseId,
    alignmentRecordId: "0x" + "0".repeat(64),
    position: [0.0, 0.016, 0.382],
    normal: [0, 1, 0],
    amount: "1000000",
    title: "Carpet stain (scripted Arc test)",
    photoSha256: null,
  };
  const claimCanon = canonicalize(claimManifest);
  const claimContentHash =
    "0x" + crypto.createHash("sha256").update(claimCanon).digest("hex");
  const claimRecordId = keccak256(
    encodeAbiParameters(
      [{ type: "address" }, { type: "bytes32" }, { type: "uint8" }],
      [landlord.address, claimContentHash, 5],
    ),
  );

  const sealClaimHash = await landlordWallet.writeContract({
    address: registry,
    abi: REGISTRY_ABI,
    functionName: "seal",
    args: [unitId, leaseId, 5, claimContentHash],
    maxFeePerGas: MIN_FEE,
    maxPriorityFeePerGas: 1_000_000_000n,
  });
  await waitAndRecord("seal(ClaimEvidence)", sealClaimHash);

  const fileHash = await landlordWallet.writeContract({
    address: escrow,
    abi: ESCROW_ABI,
    functionName: "fileClaim",
    args: [leaseId, claimRecordId, parseUnits("1", 6)],
    maxFeePerGas: MIN_FEE,
    maxPriorityFeePerGas: 1_000_000_000n,
  });
  const fileReceipt = await waitAndRecord("fileClaim(1 USDC)", fileHash);
  let claimId = 1n;
  for (const log of fileReceipt.logs) {
    if (log.address.toLowerCase() !== escrow.toLowerCase()) continue;
    try {
      const ev = decodeEventLog({ abi: ESCROW_ABI, data: log.data, topics: log.topics });
      if (ev.eventName === "ClaimFiled") claimId = ev.args.claimId;
    } catch {}
  }

  const closeHash = await landlordWallet.writeContract({
    address: escrow,
    abi: ESCROW_ABI,
    functionName: "closeClaims",
    args: [leaseId],
    maxFeePerGas: MIN_FEE,
    maxPriorityFeePerGas: 1_000_000_000n,
  });
  await waitAndRecord("closeClaims", closeHash);

  // 7. Renter accepts claim & settles ($1 landlord / $1 renter)
  const acceptHash = await renterWallet.writeContract({
    address: escrow,
    abi: ESCROW_ABI,
    functionName: "acceptClaim",
    args: [claimId],
    maxFeePerGas: MIN_FEE,
    maxPriorityFeePerGas: 1_000_000_000n,
  });
  await waitAndRecord("acceptClaim", acceptHash);

  const settleHash = await renterWallet.writeContract({
    address: escrow,
    abi: ESCROW_ABI,
    functionName: "settle",
    args: [leaseId],
    maxFeePerGas: MIN_FEE,
    maxPriorityFeePerGas: 1_000_000_000n,
  });
  await waitAndRecord("settle(1 USDC / 1 USDC)", settleHash);

  // Save the real sealed MoveInScan record + settled lease in Supabase so /verify is live immediately!
  const supabase = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } },
  );

  await supabase.from("leases").upsert(
    {
      lease_id: leaseId.toLowerCase(),
      unit_id: unitId.toLowerCase(),
      unit_name: "Apt 302 · Reference Bedroom (Arc Verified)",
      landlord_address: landlord.address.toLowerCase(),
      renter_address: renter.address.toLowerCase(),
      reviewer_address: reviewer.toLowerCase(),
      move_in_scan_path: "/models/apartment-move-in.glb",
      move_out_scan_path: "/models/apartment-move-out.glb",
      move_in_record_id: moveInRecordId.toLowerCase(),
      move_out_record_id: moveOutRecordId.toLowerCase(),
      created_tx_hash: createHash,
      funded_tx_hash: fundHash,
      ended_tx_hash: endHash,
      settled_tx_hash: settleHash,
      total_gas_cost_wei: totalGasWei.toString(),
      tx_count: receipts.length,
    },
    { onConflict: "lease_id" },
  );

  await supabase.from("records").upsert(
    {
      record_id: moveInRecordId.toLowerCase(),
      unit_id: unitId.toLowerCase(),
      lease_id: leaseId.toLowerCase(),
      kind: 0,
      content_hash: moveInContentHash.toLowerCase(),
      author: renter.address.toLowerCase(),
      manifest_json: moveInCanon,
      file_paths: ["/models/apartment-move-in.glb"],
      tx_hash: sealInHash,
      block_number: Number(sealInReceipt.blockNumber),
      gas_cost_wei: (sealInReceipt.gasUsed * sealInReceipt.effectiveGasPrice).toString(),
    },
    { onConflict: "record_id" },
  );

  const finalLease = await pub.readContract({
    address: escrow,
    abi: ESCROW_ABI,
    functionName: "getLease",
    args: [leaseId],
  });

  console.log("\n=== FULL ARC TESTNET LEASE COMPLETE ===");
  console.log("leaseId:         ", leaseId);
  console.log("moveInRecordId:  ", moveInRecordId);
  console.log("final state:     ", finalLease.state, "(3 = Settled)");
  console.log("landlordPayout:  ", formatUnits(finalLease.landlordPayout, 6), "USDC");
  console.log("renterPayout:    ", formatUnits(finalLease.renterPayout, 6), "USDC");
  console.log("totalGasUsdc:    ", Number(formatUnits(totalGasWei, 18)).toFixed(6), "USDC across", receipts.length, "txs");
  console.log("SUMMARY_JSON=" + JSON.stringify({ leaseId, moveInRecordId, totalGasUsdc: Number(formatUnits(totalGasWei, 18)).toFixed(6), receipts }));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
