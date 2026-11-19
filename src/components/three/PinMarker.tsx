"use client";

import { Html } from "@react-three/drei";
import {
  CheckCircle2,
  DollarSign,
  MapPin,
  Sparkles,
  UserCheck,
} from "lucide-react";

export type PinVariant =
  | "renter"
  | "landlord"
  | "ai"
  | "claim"
  | "sealed"
  | "tap";

export interface SpatialPinItem {
  id: string;
  position: [number, number, number];
  normal?: [number, number, number];
  label: string;
  sublabel?: string;
  variant: PinVariant;
  priceTag?: string;
  selected?: boolean;
}

const VARIANT_STYLES: Record<
  PinVariant,
  { sphere: string; pill: string; icon: "renter" | "landlord" | "ai" | "claim" | "sealed" | "tap" }
> = {
  renter: {
    sphere: "#1d4ed8",
    pill: "bg-[#1d4ed8] text-white border-white/80",
    icon: "renter",
  },
  landlord: {
    sphere: "#6d28d9",
    pill: "bg-[#6d28d9] text-white border-white/80",
    icon: "landlord",
  },
  ai: {
    sphere: "#b45309",
    pill: "bg-[#b45309] text-white border-white/80",
    icon: "ai",
  },
  claim: {
    sphere: "#b91c1c",
    pill: "bg-[#b91c1c] text-white border-white/80",
    icon: "claim",
  },
  sealed: {
    sphere: "#15803d",
    pill: "bg-[#15803d] text-white border-white/80",
    icon: "sealed",
  },
  tap: {
    sphere: "#161616",
    pill: "bg-[#161616] text-white border-white/90",
    icon: "tap",
  },
};

function PinIcon({ type }: { type: PinVariant }) {
  switch (type) {
    case "renter":
      return <MapPin className="h-3 w-3 shrink-0" />;
    case "landlord":
      return <UserCheck className="h-3 w-3 shrink-0" />;
    case "ai":
      return <Sparkles className="h-3 w-3 shrink-0" />;
    case "claim":
      return <DollarSign className="h-3 w-3 shrink-0" />;
    case "sealed":
      return <CheckCircle2 className="h-3 w-3 shrink-0" />;
    case "tap":
      return null;
  }
}

export function PinMarker({
  pin,
  onSelect,
}: {
  pin: SpatialPinItem;
  onSelect?: (pin: SpatialPinItem) => void;
}) {
  const style = VARIANT_STYLES[pin.variant];
  const radius = pin.selected ? 0.055 : 0.04;

  return (
    <group position={pin.position}>
      <mesh
        onClick={(e) => {
          e.stopPropagation();
          onSelect?.(pin);
        }}
      >
        <sphereGeometry args={[radius, 18, 18]} />
        <meshStandardMaterial
          color={style.sphere}
          emissive={style.sphere}
          emissiveIntensity={pin.selected ? 0.45 : 0.18}
        />
      </mesh>

      <Html
        position={[0, 0.09, 0]}
        center
        distanceFactor={5}
        style={{ pointerEvents: onSelect ? "auto" : "none" }}
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onSelect?.(pin);
          }}
          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold shadow-md whitespace-nowrap transition-transform hover:scale-105 cursor-pointer ${style.pill} ${
            pin.selected ? "ring-2 ring-white scale-105" : ""
          }`}
        >
          <PinIcon type={style.icon} />
          <span>{pin.label}</span>
          {pin.priceTag && (
            <span className="ml-0.5 rounded-full bg-white/20 px-1.5 py-0 text-[10px]">
              {pin.priceTag}
            </span>
          )}
        </button>
      </Html>
    </group>
  );
}
