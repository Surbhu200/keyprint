import { NextRequest, NextResponse } from "next/server";
import type { Address, Hex } from "viem";
import { z } from "zod";
import {
  createArcPublicClient,
  getEscrowAddress,
  getRegistryAddress,
  KEYPRINT_ESCROW_ABI,
} from "@/lib/chain/arc";
import {
  manifestKindToEnum,
  ZERO_BYTES32,
  type KeyprintManifest,
} from "@/lib/evidence/manifest";
import {
  checkRowAgainstRecord,
  readRecordsOnchain,
  type OnchainRecordInfo,
} from "@/lib/evidence/onchain-record";
import { getSupabaseAdmin, isSafeStoragePath, isSupabaseConfigured } from "@/lib/supabase/server";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const HEX32 = /^0x[0-9a-fA-F]{64}$/;
const PUBLIC_COLUMNS =
  "record_id, unit_id, lease_id, kind, content_hash, author, manifest_json, tx_hash, block_number, sealed_at";

export async function GET(req: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { error: "The record index is not configured.", configured: false },
      { status: 503 },
    );
  }

  const recordId = req.nextUrl.searchParams.get("recordId")?.trim().toLowerCase();
  const leaseId = req.nextUrl.searchParams.get("leaseId")?.trim().toLowerCase();
  const fileSha256 = req.nextUrl.searchParams.get("fileSha256")?.trim().toLowerCase();

  try {
    const supabase = getSupabaseAdmin();

    if (recordId) {
      if (!HEX32.test(recordId)) {
        return NextResponse.json({ error: "Invalid record id." }, { status: 400 });
      }
      const { data, error } = await supabase
        .from("records")
        .select(PUBLIC_COLUMNS)
        .eq("record_id", recordId)
        .maybeSingle();
      if (error) throw error;
      return NextResponse.json({ record: data ?? null, records: data ? [data] : [], configured: true });
    }

    if (fileSha256) {
      // A file's SHA-256 appears verbatim inside the canonical manifest of every record that
      // lists it. Return every match (the browser verifies each one against Arc).
      if (!/^[0-9a-f]{64}$/.test(fileSha256)) {
        return NextResponse.json({ error: "Invalid file fingerprint." }, { status: 400 });
      }
      const { data, error } = await supabase
        .from("records")
        .select(PUBLIC_COLUMNS)
        .ilike("manifest_json", `%${fileSha256}%`)
        .order("sealed_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return NextResponse.json({ records: data ?? [], configured: true });
    }

    if (leaseId) {
      if (!HEX32.test(leaseId)) {
        return NextResponse.json({ error: "Invalid lease id." }, { status: 400 });
      }
      const { data, error } = await supabase
        .from("records")
        .select(PUBLIC_COLUMNS)
        .eq("lease_id", leaseId)
        .order("sealed_at", { ascending: true })
        .limit(200);
      if (error) throw error;
      return NextResponse.json({ records: data ?? [], configured: true });
    }

    return NextResponse.json(
      { error: "Pass recordId, fileSha256 or leaseId." },
      { status: 400 },
    );
  } catch (err) {
    console.error("GET /api/records failed", err);
    return NextResponse.json({ error: "The record index could not be read." }, { status: 500 });
  }
}

const RecordBody = z.object({
  record_id: z.string().regex(HEX32),
  manifest_json: z.string().min(2).max(65_536),
  file_paths: z.array(z.string().max(300)).max(10).optional(),
  tx_hash: z.string().regex(HEX32).nullable().optional(),
  gas_cost_wei: z.string().regex(/^\d{1,40}$/).nullable().optional(),
});

function bad(status: number, error: string) {
  return NextResponse.json({ error }, { status });
}

/** Right after a user operation lands, this server's RPC can lag a block behind the bundler's. */
async function readRecordWithRetry(recordId: Hex): Promise<OnchainRecordInfo | null> {
  const client = createArcPublicClient();
  for (let attempt = 0; attempt < 8; attempt++) {
    const found = (await readRecordsOnchain([recordId], client)).get(recordId.toLowerCase()) ?? null;
    if (found) return found;
    await new Promise((r) => setTimeout(r, 750));
  }
  return null;
}

/**
 * POST /api/records
 * Stores a sealed record's exact canonical manifest bytes in the index.
 * Nothing in the body is trusted: the record must already be sealed on Arc, the manifest
 * bytes must hash to its contentHash, and every stored field is derived from the chain.
 * A row that already matches Arc is never overwritten.
 */
export async function POST(req: NextRequest) {
  if (!isSupabaseConfigured()) {
    return bad(503, "The record index is not configured.");
  }
  if (!getRegistryAddress()) {
    return bad(503, "The registry address is not configured.");
  }

  let body: z.infer<typeof RecordBody>;
  try {
    body = RecordBody.parse(await req.json());
  } catch {
    return bad(400, "record_id (32-byte hex) and manifest_json (at most 64 KB) are required.");
  }

  try {
    const recordId = body.record_id.toLowerCase() as Hex;
    const onchain = await readRecordWithRetry(recordId);
    if (!onchain) {
      return bad(409, "This record is not sealed on Arc yet.");
    }

    const check = await checkRowAgainstRecord(
      {
        record_id: recordId,
        lease_id: onchain.leaseId,
        kind: onchain.kind,
        author: onchain.author,
        manifest_json: body.manifest_json,
      },
      onchain,
    );
    if (!check.ok) return bad(422, check.reason);

    let manifest: KeyprintManifest;
    try {
      manifest = JSON.parse(body.manifest_json) as KeyprintManifest;
    } catch {
      return bad(422, "Manifest is not valid JSON.");
    }
    if (
      manifestKindToEnum(manifest) !== onchain.kind ||
      String(manifest.leaseId ?? "").toLowerCase() !== onchain.leaseId.toLowerCase()
    ) {
      return bad(422, "Manifest kind or lease does not match the sealed record.");
    }

    const leaseIdLower = onchain.leaseId.toLowerCase();
    const isSolo = leaseIdLower === ZERO_BYTES32;
    if (!isSolo) {
      const escrow = getEscrowAddress();
      if (!escrow) return bad(503, "The escrow address is not configured.");
      const lease = await createArcPublicClient().readContract({
        address: escrow,
        abi: KEYPRINT_ESCROW_ABI,
        functionName: "getLease",
        args: [onchain.leaseId],
      });
      const author = onchain.author.toLowerCase();
      if (
        lease.landlord === ZERO_ADDRESS ||
        (author !== lease.renter.toLowerCase() && author !== lease.landlord.toLowerCase())
      ) {
        return bad(422, "The record's author is not a party to this lease.");
      }
    }

    // Only keep storage paths inside this record's own lease (or solo) folder.
    const allowedPrefixes = isSolo
      ? ["solo/", "solo-photos/"]
      : [`leases/${leaseIdLower}/`];
    const filePaths = (body.file_paths ?? []).filter(
      (p) =>
        !p.includes("..") &&
        isSafeStoragePath(p) &&
        allowedPrefixes.some((prefix) => p.toLowerCase().startsWith(prefix)),
    );

    // Only accept a tx hash whose receipt really contains this record's RecordSealed log.
    let txHash: string | null = null;
    let blockNumber: number | null = null;
    if (body.tx_hash) {
      try {
        const receipt = await createArcPublicClient().getTransactionReceipt({
          hash: body.tx_hash as Hex,
        });
        const registry = getRegistryAddress()!.toLowerCase();
        const hasSealLog = receipt.logs.some(
          (log) =>
            log.address.toLowerCase() === registry &&
            (log.topics[1] ?? "").toLowerCase() === recordId,
        );
        if (hasSealLog) {
          txHash = body.tx_hash.toLowerCase();
          blockNumber = Number(receipt.blockNumber);
        }
      } catch {
        // Unknown or pending tx: store the record without a receipt link.
      }
    }

    const supabase = getSupabaseAdmin();
    const { data: existing } = await supabase
      .from("records")
      .select(PUBLIC_COLUMNS)
      .eq("record_id", recordId)
      .maybeSingle();

    if (
      existing &&
      existing.manifest_json === body.manifest_json &&
      Number(existing.kind) === onchain.kind &&
      String(existing.lease_id).toLowerCase() === leaseIdLower &&
      String(existing.author).toLowerCase() === onchain.author.toLowerCase() &&
      String(existing.content_hash).toLowerCase() === onchain.contentHash.toLowerCase()
    ) {
      // Already stored and identical to Arc: idempotent success, never overwrite.
      return NextResponse.json({ record: existing });
    }

    // Either new, or the stored row doesn't match Arc (written before verification existed):
    // replace it with the verified bytes.
    const { data, error } = await supabase
      .from("records")
      .upsert(
        {
          record_id: recordId,
          unit_id: onchain.unitId.toLowerCase(),
          lease_id: leaseIdLower,
          kind: onchain.kind,
          content_hash: onchain.contentHash.toLowerCase(),
          author: (onchain.author as Address).toLowerCase(),
          manifest_json: body.manifest_json,
          file_paths: filePaths,
          tx_hash: txHash,
          block_number: blockNumber,
          gas_cost_wei: body.gas_cost_wei ?? "0",
          sealed_at: new Date(onchain.createdAt * 1000).toISOString(),
        },
        { onConflict: "record_id" },
      )
      .select(PUBLIC_COLUMNS)
      .single();

    if (error) throw error;
    return NextResponse.json({ record: data });
  } catch (err) {
    console.error("POST /api/records failed", err);
    return bad(500, "The record could not be saved.");
  }
}
