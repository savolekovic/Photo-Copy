import { Router } from "express";
import { listLiterature } from "../controllers/literatureController.js";

const router = Router();

router.get("/", listLiterature);

export default router;
