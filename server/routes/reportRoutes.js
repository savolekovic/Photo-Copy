import { Router } from "express";
import {
  getProductionReport,
  productionReportValidators,
} from "../controllers/reportController.js";
import { requireOperator } from "../middleware/authMiddleware.js";

const router = Router();

// Reports are a back-office view of every student's orders, so operator only.
router.get("/production", requireOperator, productionReportValidators, getProductionReport);

export default router;
