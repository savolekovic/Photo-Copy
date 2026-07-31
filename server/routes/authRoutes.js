import { Router } from "express";
import {
  logout,
  me,
  requestLink,
  requestLinkValidators,
  updateMe,
  updateMeValidators,
  verifyLink,
  verifyValidators,
} from "../controllers/authController.js";
import { requireAuth } from "../middleware/authMiddleware.js";

const router = Router();

router.post("/request-link", requestLinkValidators, requestLink);
router.post("/verify", verifyValidators, verifyLink);
router.post("/logout", logout);
router.get("/me", me);
router.patch("/me", requireAuth, updateMeValidators, updateMe);

export default router;
