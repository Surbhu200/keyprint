"use client";

import {
  ContractAddress,
  encodeTransfer,
  toCircleSmartAccount,
  toModularTransport,
  toPasskeyTransport,
  toWebAuthnCredential,
  WebAuthnMode,
} from "@circle-fin/modular-wallets-core";
import {
  createPublicClient,
  custom,
  encodeFunctionData,
  erc20Abi,
  parseUnits,
  type Address,
  type Hex,
} from "viem";
import {
  createBundlerClient,
  toWebAuthnAccount,
  type P256Credential,
} from "viem/account-abstraction";
import { arcTestnet } from "viem/chains";
import {
  ARC_USDC_ADDRESS,
  CIRCLE_DEFAULT_CLIENT_URL,
  computeRecordId,
  createArcPublicClient,
  getRegistryAddress,
  KEYPRINT_REGISTRY_ABI,
  type RecordKindValue,
} from "./arc";

export interface SavedPasskeySession {
  username: string;
  address: Address;
  credential: {
    id: string;
    publicKey: Hex;
    rpId?: string;
  };
  createdAt: string;
}

export interface SponsoredCall {
  to: Address;
  data: Hex;
  value?: bigint;
}

export interface UserOpResult {
  userOpHash: Hex;
  txHash: Hex;
  blockNumber: bigint;
  actualGasCost: bigint;
}

const STORAGE_KEY = "keyprint.passkey.session.v1";
const SESSION_EVENT = "keyprint-session-change";

let cachedRawSession: string | null = null;
let cachedParsedSession: SavedPasskeySession | null = null;

export function getCircleConfig(): { clientUrl: string; clientKey: string } {
  const clientUrl =
    process.env.NEXT_PUBLIC_CIRCLE_CLIENT_URL?.trim() || CIRCLE_DEFAULT_CLIENT_URL;
  const clientKey = process.env.NEXT_PUBLIC_CIRCLE_CLIENT_KEY?.trim() || "";
  if (!clientKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_CIRCLE_CLIENT_KEY. Add your Circle Client Key in .env.local or Vercel Environment Variables.",
    );
  }
  return { clientUrl, clientKey };
}

export function loadSavedSession(): SavedPasskeySession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === cachedRawSession) return cachedParsedSession;
    cachedRawSession = raw;
    if (!raw) {
      cachedParsedSession = null;
      return null;
    }
    const parsed = JSON.parse(raw) as SavedPasskeySession;
    if (!parsed?.address || !parsed?.credential?.id || !parsed?.credential?.publicKey) {
      cachedParsedSession = null;
      return null;
    }
    cachedParsedSession = parsed;
    return parsed;
  } catch {
    cachedParsedSession = null;
    return null;
  }
}

export function subscribePasskeySession(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = () => callback();
  window.addEventListener("storage", handler);
  window.addEventListener(SESSION_EVENT, handler);
  return () => {
    window.removeEventListener("storage", handler);
    window.removeEventListener(SESSION_EVENT, handler);
  };
}

export function saveSession(session: SavedPasskeySession): void {
  if (typeof window === "undefined") return;
  const raw = JSON.stringify(session);
  cachedRawSession = raw;
  cachedParsedSession = session;
  window.localStorage.setItem(STORAGE_KEY, raw);
  window.dispatchEvent(new Event(SESSION_EVENT));
}

export function clearSession(): void {
  if (typeof window === "undefined") return;
  cachedRawSession = null;
  cachedParsedSession = null;
  window.localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new Event(SESSION_EVENT));
}

function toP256Credential(saved: { id: string; publicKey: Hex }): P256Credential {
  // viem's toWebAuthnAccount only reads `{ id, publicKey }` at runtime; `raw` is unused.
  return {
    id: saved.id,
    publicKey: saved.publicKey,
    raw: undefined as unknown as P256Credential["raw"],
  };
}

async function resolveSmartAccountAddress(credential: P256Credential): Promise<Address> {
  const { clientUrl, clientKey } = getCircleConfig();
  const transport = toModularTransport(`${clientUrl}/arcTestnet`, clientKey);
  const client = createPublicClient({ chain: arcTestnet, transport });
  const account = await toCircleSmartAccount({
    client,
    owner: toWebAuthnAccount({ credential }),
  });
  return account.address;
}

/** Where a passkey sign-up or sign-in is, so the screen can say what's happening. */
export type PasskeyStep = "preparing" | "faceid" | "verifying" | "account";

const CIRCLE_USERNAME = /^[A-Za-z0-9_@.:+-]{5,50}$/;

/**
 * Circle passkey usernames must be 5-50 characters of letters, digits and _@.:+- (no spaces).
 * Turns any typed name into one, with a short suffix so two people named "Alex" don't collide.
 */
export function toCircleUsername(name: string, suffix: string): string {
  const slug =
    name
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "") // drop accents: "García" -> "Garcia"
      .replace(/[^A-Za-z0-9_@.:+-]+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40) || "keyprint";
  const tail = suffix.replace(/[^A-Za-z0-9]/g, "").slice(0, 8) || "0000";
  return `${slug}-${tail}`.slice(0, 50).padEnd(5, "0");
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 7);
}

/** A fresh suffix for a new Circle passkey username (one per sign-up attempt). */
export function newPasskeySuffix(): string {
  return randomSuffix();
}

type OptionsMethod = "rp_getRegistrationOptions" | "rp_getLoginOptions";

// Used for up to 50 s; refreshed once older than 20 s (pages refresh it every 40 s).
const PREFETCH_TTL_MS = 50 * 1000;
const PREFETCH_REFRESH_AFTER_MS = 20 * 1000;
let prefetchedOptions: Array<{ method: OptionsMethod; key: string; result: unknown; at: number }> = [];

function realPasskeyTransport() {
  const { clientUrl, clientKey } = getCircleConfig();
  return toPasskeyTransport(clientUrl, clientKey)({ retryCount: 0 });
}

/**
 * Fetches passkey options before the tap. Safari (iPhone) only opens Face ID when the
 * passkey call happens right after the tap, so the network round trip has to happen first
 * (Apple's own guidance). Safe to call often: fresh results are reused for 2 minutes.
 */
export async function prefetchPasskeyOptions(kind: "register" | "login", username = ""): Promise<void> {
  if (typeof window === "undefined") return;
  const method: OptionsMethod = kind === "register" ? "rp_getRegistrationOptions" : "rp_getLoginOptions";
  const key = kind === "register" ? username.trim() : "";
  const now = Date.now();
  if (
    prefetchedOptions.some(
      (o) => o.method === method && o.key === key && now - o.at < PREFETCH_REFRESH_AFTER_MS,
    )
  ) {
    return;
  }
  try {
    const result = await realPasskeyTransport().request({ method, params: [key] } as never);
    prefetchedOptions = [
      ...prefetchedOptions.filter((o) => !(o.method === method && o.key === key)),
      { method, key, result, at: Date.now() },
    ];
  } catch {
    // Not fatal: the tap fetches options itself.
  }
}

/** Takes (and removes) fresh prefetched options: each challenge is used once. */
function takePrefetchedOptions(method: OptionsMethod, key: string): unknown | undefined {
  const now = Date.now();
  const hit = prefetchedOptions.find(
    (o) => o.method === method && o.key === key && now - o.at < PREFETCH_TTL_MS,
  );
  prefetchedOptions = prefetchedOptions.filter((o) => !(o.method === method && o.key === key));
  return hit?.result;
}

/**
 * Circle's passkey transport, except the options step is answered from the prefetch when
 * possible, so the browser's passkey prompt opens immediately after the tap.
 */
function passkeyTransportWithPrefetch(onStep?: (step: PasskeyStep) => void) {
  const real = realPasskeyTransport();
  return custom(
    {
      async request({ method, params }: { method: string; params?: unknown }) {
        if (method === "rp_getRegistrationOptions" || method === "rp_getLoginOptions") {
          const key =
            method === "rp_getRegistrationOptions"
              ? String((Array.isArray(params) ? params[0] : "") ?? "").trim()
              : "";
          const cached = takePrefetchedOptions(method, key);
          const result =
            cached !== undefined ? cached : await real.request({ method, params } as never);
          onStep?.("faceid");
          return result;
        }
        if (method === "rp_getRegistrationVerification" || method === "rp_getLoginVerification") {
          onStep?.("verifying");
        }
        return real.request({ method, params } as never);
      },
    },
    { key: real.config.key, name: real.config.name, retryCount: 0 },
  );
}

/**
 * Registers a brand-new passkey on the current origin (Face ID / Windows Hello)
 * and resolves its deterministic Circle Modular Smart Account on Arc Testnet.
 */
export async function registerPasskeyAccount(
  username: string,
  onStep?: (step: PasskeyStep) => void,
  displayName?: string,
): Promise<SavedPasskeySession> {
  getCircleConfig(); // fails fast with a clear message if the client key is missing
  const typed = username.trim();
  // Callers should pass a valid Circle username (see toCircleUsername); fix it up if not.
  const circleUsername = CIRCLE_USERNAME.test(typed) ? typed : toCircleUsername(typed, randomSuffix());
  const trimmed = displayName?.trim() || typed || circleUsername;
  onStep?.("preparing");
  const credential = await toWebAuthnCredential({
    transport: passkeyTransportWithPrefetch(onStep),
    mode: WebAuthnMode.Register,
    username: circleUsername,
  });
  onStep?.("account");

  const cleanCredential = toP256Credential({
    id: credential.id,
    publicKey: credential.publicKey,
  });
  const address = await resolveSmartAccountAddress(cleanCredential);
  const session: SavedPasskeySession = {
    username: trimmed,
    address,
    credential: {
      id: credential.id,
      publicKey: credential.publicKey,
      rpId: credential.rpId,
    },
    createdAt: new Date().toISOString(),
  };
  saveSession(session);
  return session;
}

/**
 * Signs in an existing passkey on the current origin via WebAuthnMode.Login.
 */
export async function loginPasskeyAccount(
  usernameHint?: string,
  onStep?: (step: PasskeyStep) => void,
): Promise<SavedPasskeySession> {
  getCircleConfig();
  onStep?.("preparing");
  const credential = await toWebAuthnCredential({
    transport: passkeyTransportWithPrefetch(onStep),
    mode: WebAuthnMode.Login,
    ...(usernameHint ? { username: usernameHint } : {}),
  });
  onStep?.("account");

  const cleanCredential = toP256Credential({
    id: credential.id,
    publicKey: credential.publicKey,
  });
  const address = await resolveSmartAccountAddress(cleanCredential);
  const existing = loadSavedSession();
  const session: SavedPasskeySession = {
    username: usernameHint?.trim() || existing?.username || "Keyprint User",
    address,
    credential: {
      id: credential.id,
      publicKey: credential.publicKey,
      rpId: credential.rpId,
    },
    createdAt: existing?.createdAt || new Date().toISOString(),
  };
  saveSession(session);
  return session;
}

/**
 * Sends one or more contract calls in a single atomic, gas-sponsored ERC-4337
 * UserOperation on Arc Testnet using Circle Modular Wallets (paymaster: true).
 *
 * Throws if the operation was included but its calls reverted (receipt.success === false):
 * a bundle transaction can succeed while the user's calls inside it fail, and treating
 * that as success would silently skip a dispute or a seal at a deadline.
 */
export async function sendSponsoredCalls(
  session: SavedPasskeySession,
  calls: SponsoredCall[],
  options?: {
    /** Called once the passkey has signed and the operation is on its way. */
    onSubmitted?: (userOpHash: Hex) => void;
  },
): Promise<UserOpResult> {
  if (calls.length === 0) {
    throw new Error("No calls to submit.");
  }
  const { clientUrl, clientKey } = getCircleConfig();
  const transport = toModularTransport(`${clientUrl}/arcTestnet`, clientKey);
  const client = createPublicClient({ chain: arcTestnet, transport });
  const owner = toWebAuthnAccount({
    credential: toP256Credential({
      id: session.credential.id,
      publicKey: session.credential.publicKey,
    }),
  });
  const account = await toCircleSmartAccount({ client, owner });
  const bundler = createBundlerClient({
    account,
    chain: arcTestnet,
    transport,
    // arcTestnet has no blockTime in viem, so receipts would otherwise be polled every 4 s.
    pollingInterval: 500,
  });

  const userOpHash = await bundler.sendUserOperation({
    calls,
    paymaster: true,
  });
  options?.onSubmitted?.(userOpHash);

  const opReceipt = await bundler.waitForUserOperationReceipt({
    hash: userOpHash,
  });

  if (!opReceipt.success) {
    // Raw revert data (0x…) means nothing to people; a readable reason is kept.
    const reason =
      opReceipt.reason && !/^0x/i.test(opReceipt.reason.trim()) ? ` (${opReceipt.reason})` : "";
    throw new Error(`This step was rejected by the contract${reason}. Nothing changed.`);
  }

  return {
    userOpHash,
    txHash: opReceipt.receipt.transactionHash,
    blockNumber: opReceipt.receipt.blockNumber,
    actualGasCost: opReceipt.actualGasCost ?? 0n,
  };
}

/** Arc's block time for a confirmed operation, so seal times never come from this device's clock. */
export async function sealTimeIso(blockNumber: bigint): Promise<string> {
  try {
    const block = await createArcPublicClient().getBlock({ blockNumber });
    return new Date(Number(block.timestamp) * 1000).toISOString();
  } catch {
    return new Date().toISOString();
  }
}

/**
 * Turns wallet, passkey and contract errors into plain words for main screens.
 * The raw message is still logged to the console for debugging.
 */
export function friendlyError(err: unknown, fallback = "Something went wrong. Nothing was sent."): string {
  const raw = err instanceof Error ? err.message : typeof err === "string" ? err : "";
  if (raw) console.error("[keyprint]", err);
  const text = raw.toLowerCase();
  if (!text) return fallback;
  if (
    text.includes("notallowederror") ||
    text.includes("not allowed") ||
    text.includes("timed out or was not allowed") ||
    text.includes("operation was aborted") ||
    text.includes("abort") ||
    text.includes("cancel")
  ) {
    return "Passkey prompt closed. Nothing was sent.";
  }
  if (text.includes("next_public_circle_client_key")) {
    return "Passkey sign-in isn't available right now. You can still open the sample apartment and Verify.";
  }
  if (text.includes("transfer amount exceeds balance") || text.includes("insufficient")) {
    return "Not enough dollars in this account for this step.";
  }
  if (text.includes("invalidleasestate") || text.includes("alreadysettled")) {
    return "This step already happened. Refreshing…";
  }
  if (text.includes("rejected by the contract")) {
    return raw;
  }
  if (text.includes("fetch") || text.includes("network") || text.includes("http request failed")) {
    return "Couldn't reach Arc right now. Check the connection and try again.";
  }
  if (text.includes("useroperation") || text.includes("calldata") || text.includes("0x")) {
    return withCause(fallback, err);
  }
  return raw.length > 160 ? withCause(fallback, err) : raw;
}

/**
 * Adds the deepest short reason from a wallet/bundler error chain (for example
 * "AA24 signature error") to a friendly message, with hex blobs removed, so a failed
 * step can be diagnosed from the screen of a phone.
 */
function withCause(message: string, err: unknown): string {
  let reason = "";
  let current: unknown = err;
  for (let depth = 0; depth < 8 && current && typeof current === "object"; depth++) {
    const e = current as { shortMessage?: unknown; details?: unknown; cause?: unknown };
    const short = typeof e.shortMessage === "string" ? e.shortMessage : "";
    const details = typeof e.details === "string" ? e.details : "";
    if (short || details) reason = [short, details && !short.includes(details) ? details : ""].filter(Boolean).join(" ");
    current = e.cause;
  }
  const clean = reason
    .replace(/0x[0-9a-fA-F]{12,}/g, "0x…")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
  return clean ? `${message} Details: ${clean}` : message;
}

/**
 * Sends ERC-20 USDC (6 decimals) on Arc Testnet with sponsored gas.
 * Used for Checkpoint 2 verification and rehearsal fund recycling.
 */
export async function sendSponsoredUsdcTransfer(
  session: SavedPasskeySession,
  recipient: Address,
  amountUsd: string,
): Promise<UserOpResult> {
  const amount = parseUnits(amountUsd, 6);
  const { to, data } = encodeTransfer(
    recipient,
    ContractAddress.ArcTestnet_USDC,
    amount,
  );
  return sendSponsoredCalls(session, [{ to: to as Address, data }]);
}

/** Reads the account's 6-decimal ERC-20 USDC balance on Arc Testnet. */
export async function readUsdcBalance(account: Address): Promise<bigint> {
  const publicClient = createArcPublicClient();
  return publicClient.readContract({
    address: ARC_USDC_ADDRESS,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [account],
  });
}

export interface SealInput {
  unitId: Hex;
  leaseId: Hex;
  kind: RecordKindValue;
  contentHash: Hex;
}

/**
 * Pre-checks every seal against KeyprintRegistry.exists() so a duplicate
 * recordId from a retry or rehearsal never reverts an entire batched UserOp.
 */
export async function buildUnsealedRegistryCalls(
  author: Address,
  seals: SealInput[],
): Promise<{ calls: SponsoredCall[]; recordIds: Hex[]; skippedIds: Hex[] }> {
  const registry = getRegistryAddress();
  if (!registry) {
    throw new Error("Missing NEXT_PUBLIC_KEYPRINT_REGISTRY_ADDRESS.");
  }

  const publicClient = createArcPublicClient();
  const seen = new Set<string>();
  const calls: SponsoredCall[] = [];
  const recordIds: Hex[] = [];
  const skippedIds: Hex[] = [];

  for (const s of seals) {
    const id = computeRecordId(author, s.contentHash, s.kind);
    recordIds.push(id);
    if (seen.has(id.toLowerCase())) {
      skippedIds.push(id);
      continue;
    }
    seen.add(id.toLowerCase());

    const alreadyExists = await publicClient.readContract({
      address: registry,
      abi: KEYPRINT_REGISTRY_ABI,
      functionName: "exists",
      args: [id],
    });

    if (alreadyExists) {
      skippedIds.push(id);
      continue;
    }

    calls.push({
      to: registry,
      data: encodeFunctionData({
        abi: KEYPRINT_REGISTRY_ABI,
        functionName: "seal",
        args: [s.unitId, s.leaseId, s.kind, s.contentHash],
      }),
    });
  }

  return { calls, recordIds, skippedIds };
}
