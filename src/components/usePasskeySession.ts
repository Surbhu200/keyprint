"use client";

import { useSyncExternalStore } from "react";
import {
  loadSavedSession,
  subscribePasskeySession,
  type SavedPasskeySession,
} from "@/lib/chain/wallet";

const getServerSnapshot = (): SavedPasskeySession | null => null;

/**
 * SSR-safe React 19 hook for reading the persisted Circle passkey session
 * from localStorage without hydration warnings or effect-based setState.
 */
export function usePasskeySession(): SavedPasskeySession | null {
  return useSyncExternalStore(
    subscribePasskeySession,
    loadSavedSession,
    getServerSnapshot,
  );
}
