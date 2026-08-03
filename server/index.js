import path from "path";
import { fileURLToPath } from "url";
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import adminRoutes from "./routes/adminRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import literatureRoutes from "./routes/literatureRoutes.js";
import orderRoutes from "./routes/orderRoutes.js";
import { attachUser } from "./middleware/authMiddleware.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Root .env first; optional server/.env overrides (explicit keys only win with override)
dotenv.config({ path: path.resolve(__dirname, "../.env") });
dotenv.config({ path: path.resolve(__dirname, ".env"), override: true });

const app = express();
const PORT = Number(process.env.PORT || 3001);
const clientUrl = process.env.CLIENT_URL || "http://localhost:5173";

// Behind Nginx/Caddy in production, so req.ip reflects X-Forwarded-For rather than the
// proxy's own address. The magic-link rate limit records it.
app.set("trust proxy", Number(process.env.TRUST_PROXY_HOPS || 1));

app.use(
  cors({
    origin: clientUrl,
    credentials: true,
  })
);
app.use(express.json());

// Resolves the session cookie into req.user for every route; does not reject anonymous
// requests, so public endpoints keep working.
app.use(attachUser);

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.use("/api/auth", authRoutes);
// Catalogue administration (fakulteti, programi, godine, predmeti, materijali, cijene).
app.use("/api/admin", adminRoutes);
app.use("/api/literature", literatureRoutes);
app.use("/api/orders", orderRoutes);

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(PORT, () => {
  console.log(`API listening on http://localhost:${PORT}`);
});
