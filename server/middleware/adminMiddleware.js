/**
 * When ADMIN_SECRET is set in the environment, protected routes require
 * header: X-Admin-Secret: <same value>
 * When unset, routes are open (convenient for local development).
 */
export function requireAdmin(req, res, next) {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) {
    return next();
  }
  const provided = req.get("x-admin-secret");
  if (provided !== secret) {
    return res.status(403).json({ error: "Forbidden" });
  }
  return next();
}
