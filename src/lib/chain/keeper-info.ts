// Server-only: reads KEEPER_KEY. Import it from route handlers, never from client components.
import type { Address, Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { createArcPublicClient } from "./arc";

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
 * Checks on Arc who sent the settlement transaction (`settled_tx_hash`).
 * Memoized in memory per tx hash because confirmed transactions never change sender.
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
    const tx = await createArcPublicClient().getTransaction({ hash: key as Hex });
    const sender = tx.from.toLowerCase();
    const keeper = getKeeperAddress()?.toLowerCase();
    // A lease party counts first: if the keeper's account is also a party (as in the scripted
    // reference lease), the settlement was not "automatic".
    let result: SettledBy = "other";
    if (
      (parties?.renter && sender === parties.renter.toLowerCase()) ||
      (parties?.landlord && sender === parties.landlord.toLowerCase())
    ) {
      result = "party";
    } else if (keeper && sender === keeper) {
      result = "keeper";
    }
    settledByCache.set(key, result);
    return result;
  } catch {
    return null;
  }
}
