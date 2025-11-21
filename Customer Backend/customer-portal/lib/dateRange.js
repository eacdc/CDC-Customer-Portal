export function resolveRange(range, from, to) {
  const now = new Date(),
    toIso = (to ? new Date(to) : now).toISOString();
  const back = (d) => new Date(now.getTime() - d * 86400000).toISOString();
  if (range === "custom" && from && to) return { from, to: toIso };
  if (range === "30d") return { from: back(30), to: toIso };
  if (range === "3m") return { from: back(90), to: toIso };
  if (range === "6m") return { from: back(180), to: toIso };
  if (range === "1y") return { from: back(365), to: toIso };
  return { from: back(90), to: toIso };
}
