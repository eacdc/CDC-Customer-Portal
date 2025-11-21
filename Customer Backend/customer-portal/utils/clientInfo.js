export function clientInfo(req) {
  const ip = (
    req.headers["x-forwarded-for"]?.split(",")[0] ||
    req.ip ||
    ""
  ).trim();
  const ua = req.headers["user-agent"] || "";
  return { ip, ua };
}
