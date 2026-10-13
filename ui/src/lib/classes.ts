// The backend names a class by its Korean job name (and, in saved fights,
// by jobId 11-19). The class icons in public/assets carry the Korean names.

export interface ClassInfo {
  key: string;
  name: string;
  color: string;
  icon: string;
}

const CLASSES: ClassInfo[] = [
  { key: "검성", name: "Gladiator", color: "#c2493d", icon: "/assets/검성.png" },
  { key: "수호성", name: "Templar", color: "#4a7fc9", icon: "/assets/수호성.png" },
  { key: "살성", name: "Assassin", color: "#4c9f58", icon: "/assets/살성.png" },
  { key: "궁성", name: "Ranger", color: "#8fa83a", icon: "/assets/궁성.png" },
  { key: "마도성", name: "Sorcerer", color: "#8a5fd1", icon: "/assets/마도성.png" },
  { key: "정령성", name: "Spiritmaster", color: "#2fa8a6", icon: "/assets/정령성.png" },
  { key: "치유성", name: "Cleric", color: "#c9a53a", icon: "/assets/치유성.png" },
  { key: "호법성", name: "Chanter", color: "#d07a34", icon: "/assets/호법성.png" },
  { key: "권성", name: "Brawler", color: "#c4557f", icon: "/assets/권성.png" },
];

const UNKNOWN: ClassInfo = { key: "", name: "Unknown", color: "#6b7280", icon: "" };

const byKey = new Map<string, ClassInfo>();
for (const c of CLASSES) {
  byKey.set(c.key, c);
  byKey.set(c.name.toLowerCase(), c);
}
byKey.set("elementalist", byKey.get("정령성")!);
byKey.set("fighter", byKey.get("권성")!);

export function classOf(job: string | null | undefined, jobId?: number): ClassInfo {
  const found = byKey.get(String(job ?? "").trim()) ?? byKey.get(String(job ?? "").trim().toLowerCase());
  if (found) return found;
  if (jobId && jobId >= 11 && jobId <= 19) return CLASSES[jobId - 11];
  return UNKNOWN;
}
