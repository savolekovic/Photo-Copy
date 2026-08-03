import { Router } from "express";
import {
  listFaculties,
  listLiterature,
  listYears,
} from "../controllers/literatureController.js";
import { requireAuth } from "../middleware/authMiddleware.js";

const router = Router();

// The catalogue sits behind login because the spec puts "prijava u sistem" before
// browsing materials, and the listing exposes pricing.
// Declared before "/" is irrelevant here (distinct paths), but grouped for clarity.
router.get("/faculties", requireAuth, listFaculties);
router.get("/years", requireAuth, listYears);
router.get("/", requireAuth, listLiterature);

export default router;
