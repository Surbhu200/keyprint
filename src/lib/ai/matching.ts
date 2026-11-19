export interface BoundingBoxPx {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface MoveInPinRef {
  id: string;
  position: [number, number, number];
  sealedAt: number;
  coSigned: boolean;
  text: string;
  /** True only if sealed within move-in reviewWindow or co-signed by landlord. */
  countsAsMoveIn: boolean;
}

export interface ProjectedPin2D {
  id: string;
  x: number;
  y: number;
}

export interface DetectedChange {
  view_id: string;
  box: BoundingBoxPx;
  title: string;
  description: string;
  category: "possible_damage" | "possible_wear" | "not_a_real_change";
  confidence: "low" | "medium" | "high";
  worldPosition?: [number, number, number];
  matchedMoveInPin?: MoveInPinRef | null;
}

/** Converts pixel center of a 1024x768 box (origin top-left, y down) to Three.js NDC. */
export function boxCenterToNdc(
  box: BoundingBoxPx,
  width = 1024,
  height = 768,
): { x: number; y: number } {
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const u = cx / width;
  const v = cy / height;
  return { x: 2 * u - 1, y: 1 - 2 * v };
}

export function distance3D(
  a: [number, number, number],
  b: [number, number, number],
): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

/**
 * Matches a change against qualifying move-in pins in CODE (never by the AI model):
 *   - Pin's 2D projected position falls inside the bounding box grown by 10%, OR
 *   - 3D raycast hit lands within 15 cm (0.15 m) of the move-in pin.
 * Only pins that count as move-in pins (sealed within review window or co-signed) can match.
 */
export function findMatchingMoveInPin(params: {
  box?: BoundingBoxPx;
  projectedPins?: ProjectedPin2D[];
  worldPosition?: [number, number, number];
  moveInPins: MoveInPinRef[];
}): MoveInPinRef | null {
  const eligible = params.moveInPins.filter((p) => p.countsAsMoveIn);
  if (eligible.length === 0) return null;

  // 1. 2D box overlap check (grown by 10%)
  if (params.box && params.projectedPins?.length) {
    const padX = params.box.w * 0.1;
    const padY = params.box.h * 0.1;
    const minX = params.box.x - padX;
    const maxX = params.box.x + params.box.w + padX;
    const minY = params.box.y - padY;
    const maxY = params.box.y + params.box.h + padY;

    for (const proj of params.projectedPins) {
      if (proj.x >= minX && proj.x <= maxX && proj.y >= minY && proj.y <= maxY) {
        const match = eligible.find((p) => p.id === proj.id);
        if (match) return match;
      }
    }
  }

  // 2. 3D geometric distance <= 15 cm (0.15 m)
  if (params.worldPosition) {
    let best: MoveInPinRef | null = null;
    let bestDist = 0.15;
    for (const pin of eligible) {
      const d = distance3D(params.worldPosition, pin.position);
      if (d <= bestDist) {
        bestDist = d;
        best = pin;
      }
    }
    if (best) return best;
  }

  return null;
}

/**
 * Merges changes detected from different views whose 3D world hits fall within 10 cm (0.10 m).
 * Keeps the higher-confidence entry when merging duplicates.
 */
export function mergeNearbyChanges(changes: DetectedChange[]): DetectedChange[] {
  const rank = { high: 3, medium: 2, low: 1 };
  const kept: DetectedChange[] = [];

  for (const item of changes) {
    if (!item.worldPosition) {
      kept.push(item);
      continue;
    }
    const existingIdx = kept.findIndex(
      (k) => k.worldPosition && distance3D(k.worldPosition, item.worldPosition!) <= 0.1,
    );
    if (existingIdx === -1) {
      kept.push(item);
    } else if (rank[item.confidence] > rank[kept[existingIdx].confidence]) {
      kept[existingIdx] = item;
    }
  }

  return kept;
}
