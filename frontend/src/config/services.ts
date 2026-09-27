/**
 * PataFundi global service catalog (spec §22/§28).
 *
 * A scalable taxonomy of services offered on the platform — but the customer
 * UI only ever shows a COMPACT core grid plus search, never a wall of
 * categories. Clicking any service goes STRAIGHT into the booking flow
 * (spec §15) — there is no informational landing page.
 */
import {
  AirVent, Bath, Blocks, Boxes, Briefcase, Building2, Cctv, Droplets, Flame,
  Flower2, Grid, Hammer, KeyRound, Laptop, Lightbulb, Monitor, PaintBucket,
  Package, Refrigerator, Smartphone, Sparkles, Sun, Truck, Wifi, Wrench,
  Zap, Bug, Car,
  type LucideIcon,
} from "lucide-react";

export interface ServiceCategory {
  id: string;
  name: string;
  icon: LucideIcon;
  color: string;
}

/**
 * Core services — the compact grid shown on the customer home. Chosen for
 * everyday demand; everything else is reachable through search / "View all".
 */
export const CORE_SERVICE_IDS = [
  "plumbing",
  "electrical",
  "hvac",
  "cleaning",
  "carpentry",
  "auto",
  "painting",
  "general",
] as const;

/**
 * The full catalog. Order = display order in "View all". Keep names
 * customer-friendly (what a person would type or say).
 */
export const SERVICE_CATALOG: ServiceCategory[] = [
  { id: "plumbing", name: "Plumbing", icon: Droplets, color: "from-blue-500 to-cyan-500" },
  { id: "electrical", name: "Electrical", icon: Lightbulb, color: "from-yellow-500 to-orange-500" },
  { id: "hvac", name: "AC & HVAC", icon: AirVent, color: "from-sky-500 to-blue-500" },
  { id: "cleaning", name: "Cleaning", icon: Sparkles, color: "from-emerald-500 to-teal-500" },
  { id: "carpentry", name: "Carpentry", icon: Hammer, color: "from-amber-500 to-yellow-600" },
  { id: "auto", name: "Auto Repair", icon: Car, color: "from-red-500 to-rose-500" },
  { id: "painting", name: "Painting", icon: PaintBucket, color: "from-purple-500 to-pink-500" },
  { id: "general", name: "General Repair", icon: Wrench, color: "from-gray-500 to-slate-500" },
  { id: "appliance_repair", name: "Appliance Repair", icon: Refrigerator, color: "from-indigo-500 to-blue-500" },
  { id: "electronics_repair", name: "Electronics Repair", icon: Monitor, color: "from-cyan-500 to-sky-600" },
  { id: "phone_repair", name: "Phone Repair", icon: Smartphone, color: "from-violet-500 to-purple-600" },
  { id: "computer_repair", name: "Computer Repair", icon: Laptop, color: "from-blue-600 to-indigo-600" },
  { id: "roofing", name: "Roofing", icon: Building2, color: "from-orange-600 to-red-600" },
  { id: "tiling_flooring", name: "Tiling & Flooring", icon: Boxes, color: "from-teal-500 to-emerald-600" },
  { id: "masonry", name: "Masonry & Concrete", icon: Blocks, color: "from-stone-500 to-neutral-600" },
  { id: "welding", name: "Welding & Metalwork", icon: Flame, color: "from-amber-600 to-orange-700" },
  { id: "glass_windows", name: "Glass & Windows", icon: Grid, color: "from-sky-400 to-cyan-600" },
  { id: "locksmith", name: "Locksmith", icon: KeyRound, color: "from-yellow-600 to-amber-700" },
  { id: "pest_control", name: "Pest Control", icon: Bug, color: "from-lime-600 to-green-700" },
  { id: "landscaping", name: "Landscaping & Gardening", icon: Flower2, color: "from-green-500 to-emerald-700" },
  { id: "solar", name: "Solar Installation", icon: Sun, color: "from-yellow-400 to-amber-500" },
  { id: "cctv_security", name: "CCTV & Security", icon: Cctv, color: "from-slate-600 to-gray-800" },
  { id: "internet_wifi", name: "Internet & WiFi", icon: Wifi, color: "from-blue-400 to-blue-600" },
  { id: "moving", name: "Moving & Packing", icon: Truck, color: "from-fuchsia-500 to-purple-600" },
  { id: "furniture_assembly", name: "Furniture Assembly", icon: Package, color: "from-amber-400 to-orange-500" },
  { id: "generator", name: "Generator Services", icon: Zap, color: "from-red-600 to-orange-700" },
  { id: "water_irrigation", name: "Water & Irrigation", icon: Bath, color: "from-cyan-400 to-teal-600" },
  { id: "commercial", name: "Commercial Maintenance", icon: Briefcase, color: "from-slate-500 to-slate-700" },
];

/** Catalog lookup by exact name or id (case-insensitive). */
export function findService(nameOrId: string): ServiceCategory | undefined {
  const q = String(nameOrId || "").trim().toLowerCase();
  if (!q) return undefined;
  return SERVICE_CATALOG.find((s) => s.id.toLowerCase() === q || s.name.toLowerCase() === q);
}

/** Best-effort match: does any catalog service appear inside free text? */
export function guessServiceFromText(text: string): ServiceCategory | undefined {
  const t = String(text || "").toLowerCase();
  if (!t) return undefined;
  const synonyms: Record<string, string[]> = {
    plumbing: ["pipe", "leak", "tap", "sink", "toilet", "drain", "water heater", "blocked"],
    electrical: ["power", "socket", "wiring", "electric", "socket", "tripping", "lights", "bulb"],
    hvac: ["ac", "aircon", "air condition", "heater", "cooling", "hvac", "split unit"],
    cleaning: ["clean", "mess", "spill", "dirty", "wash"],
    carpentry: ["door", "cabinet", "wood", "wardrobe", "shelf", "cupboard", "drawer"],
    auto: ["car", "engine", "brake", "battery", "tyre", "tire", "motor"],
    painting: ["paint", "wall", "repaint", "brush"],
    appliance_repair: ["fridge", "washing machine", "microwave", "oven", "dryer", "dishwasher"],
    phone_repair: ["phone screen", "phone", "iphone", "android"],
    computer_repair: ["laptop", "computer", "pc", "macbook"],
    pest_control: ["pest", "cockroach", "termite", "rat", "ants", "bedbug", "fumigation"],
    solar: ["solar panel", "solar", "inverter"],
    internet_wifi: ["wifi", "router", "internet", "network", "lan"],
    roofing: ["roof", "ceiling leak", "gutter"],
    locksmith: ["lock", "locked out", "key", "keys"],
    moving: ["move", "moving", "relocate", "shift house"],
    generator: ["generator", "genset"],
    cctv_security: ["cctv", "camera", "alarm", "security system", "electric fence"],
    welding: ["gate", "weld", "metal gate", "grill", "burglar"],
  };
  for (const s of SERVICE_CATALOG) {
    if (t.includes(s.name.toLowerCase()) || t.includes(s.id.replace(/_/g, " "))) return s;
  }
  for (const [id, words] of Object.entries(synonyms)) {
    if (words.some((w) => t.includes(w))) {
      return SERVICE_CATALOG.find((s) => s.id === id);
    }
  }
  return undefined;
}

// Re-export booking entry path builder — every service click in the product
// lands here (spec §15: direct into the booking flow, no marketing page).
export function bookingPathForService(serviceName: string): string {
  return `/create-job?service=${encodeURIComponent(serviceName)}`;
}
