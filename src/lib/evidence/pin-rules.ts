/**
 * Which pins count as move-in evidence (docs/BUILD.md, "Pins are evidence too"):
 * a pin authored by the lease's renter counts only if it was sealed within the
 * review window after the move-in record, or the landlord co-signed it.
 * Seal times must be onchain times (KeyprintRegistry.getRecord().createdAt),
 * never database insert times. Unknown inputs always mean "does not count".
 */
export interface MoveInPinInput {
  pinAuthor: string;
  /** Onchain seal time of the pin, unix seconds. */
  pinCreatedAt?: number | null;
  /** True only when KeyprintRegistry.acknowledgedAt(pin, lease.landlord) > 0. */
  coSignedByLandlord: boolean;
  lease: { renter: string; reviewWindow: number; fundedAt: number } | null;
  /** Onchain seal time of the lease's move-in record, unix seconds. */
  moveInCreatedAt?: number | null;
}

export function countsAsMoveInPin(input: MoveInPinInput): boolean {
  const { lease } = input;
  if (!lease) return false;
  if (input.pinAuthor.toLowerCase() !== lease.renter.toLowerCase()) return false;
  if (input.coSignedByLandlord) return true;

  const anchor =
    input.moveInCreatedAt && input.moveInCreatedAt > 0
      ? input.moveInCreatedAt
      : lease.fundedAt > 0
        ? lease.fundedAt
        : null;
  if (anchor === null || !input.pinCreatedAt) return false;
  return input.pinCreatedAt >= anchor && input.pinCreatedAt <= anchor + lease.reviewWindow;
}
