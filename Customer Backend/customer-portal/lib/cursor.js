export function encodeCursor(o) {
  return o ? Buffer.from(`${o.updatedAt}|${o.id}`).toString("base64url") : null;
}
export function decodeCursor(s) {
  if (!s) return null;
  const [updatedAt, idStr] = Buffer.from(s, "base64url").toString().split("|");
  return { updatedAt, id: Number(idStr) };
}
