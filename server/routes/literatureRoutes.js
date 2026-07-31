import { Router } from "express";
import { listLiterature } from "../controllers/literatureController.js";
import { requireAuth } from "../middleware/authMiddleware.js";

const router = Router();

// The catalogue sits behind login because the spec puts "prijava u sistem" before
// browsing materials, and the listing exposes pricing.
router.get("/", requireAuth, listLiterature);

export default router;
