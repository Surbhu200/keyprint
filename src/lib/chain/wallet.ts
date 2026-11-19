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
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SavedPasskeySession;
    if (!parsed?.address || !parsed?.credential?.id || !parsed?.credential?.publicKey) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveSession(session: SavedPasskeySession): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function clearSession(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
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

/**
 * Registers a brand-new passkey on the current origin (Face ID / Windows Hello)
 * and resolves its deterministic Circle Modular Smart Account on Arc Testnet.
 */
export async function registerPasskeyAccount(
  username: string,
): Promise<SavedPasskeySession> {
  const { clientUrl, clientKey } = getCircleConfig();
  const trimmed = username.trim() || "Keyprint User";
  const credential = await toWebAuthnCredential({
    transport: toPasskeyTransport(clientUrl, clientKey),
    mode: WebAuthnMode.Register,
    username: trimmed,
  });

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
): Promise<SavedPasskeySession> {
  const { clientUrl, clientKey } = getCircleConfig();
  const credential = await toWebAuthnCredential({
    transport: toPasskeyTransport(clientUrl, clientKey),
    mode: WebAuthnMode.Login,
    ...(usernameHint ? { username: usernameHint } : {}),
  });

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
 */
export async function sendSponsoredCalls(
  session: SavedPasskeySession,
  calls: SponsoredCall[],
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
  });

  const userOpHash = await bundler.sendUserOperation({
    calls,
    paymaster: true,
  });

  const opReceipt = await bundler.waitForUserOperationReceipt({
    hash: userOpHash,
  });

  return {
    userOpHash,
    txHash: opReceipt.receipt.transactionHash,
    blockNumber: opReceipt.receipt.blockNumber,
    actualGasCost: opReceipt.actualGasCost ?? 0n,
  };
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
