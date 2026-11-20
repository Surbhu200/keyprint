// Server-only: reads KEEPER_KEY. Import it from route handlers, never from client components.
import { parseEventLogs, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { createArcPublicClient, getEscrowAddress, KEYPRINT_ESCROW_ABI } from "./arc";

export type SettledBy = "keeper" | "party" | "other";

const settledByCache = new Map<string, SettledBy>();

/** Returns the public Arc address of Keyprint's configured keeper, or null if not configured. */
export function getKeeperAddress(): Address | null {
  const rawKey = process.env.KEEPER_KEY?.trim();
  if (!rawKey) return null;
  try {
    const normalized = (rawKey.startsWith("0x") ? rawKey : `0x${rawKey}`) as Hex;
    return privateKeyToAccount(normalized).address;
  } catch {
    return null;
  }
}

/**
 * Who settled a lease, read from the `caller` of the LeaseSettled event in the settlement
 * receipt (not the tx sender: a passkey account settles through Circle's bundler, so the
 * sender is the bundler while `caller` is the person's own account).
 * Memoized per tx hash because confirmed receipts never change; failures aren't cached.
 */
export async function resolveSettledBy(
  settledTxHash: string | null | undefined,
  parties?: { renter?: string | null; landlord?: string | null },
): Promise<SettledBy | null> {
  if (!settledTxHash || !/^0x[0-9a-fA-F]{64}$/.test(settledTxHash)) {
    return null;
  }
  const key = settledTxHash.toLowerCase();
  const cached = settledByCache.get(key);
  if (cached) return cached;

  try {
    const escrow = getEscrowAddress()?.toLowerCase();
    const receipt = await createArcPublicClient().getTransactionReceipt({ hash: key as Hex });
    const settled = parseEventLogs({
      abi: KEYPRINT_ESCROW_ABI,
      logs: receipt.logs,
      eventName: "LeaseSettled",
    }).find((log) => !escrow || log.address.toLowerCase() === escrow);
    if (!settled) return null;

    const caller = settled.args.caller.toLowerCase();
    const keeper = getKeeperAddress()?.toLowerCase();
    // A lease party counts first: if the keeper's account is also a party (as in the scripted
    // reference lease), the settlement was not "automatic".
    let result: SettledBy = "other";
    if (
      (parties?.renter && caller === parties.renter.toLowerCase()) ||
      (parties?.landlord && caller === parties.landlord.toLowerCase())
    ) {
      result = "party";
    } else if (keeper && caller === keeper) {
      result = "keeper";
    }
    settledByCache.set(key, result);
    return result;
  } catch {
    return null;
  }
}
