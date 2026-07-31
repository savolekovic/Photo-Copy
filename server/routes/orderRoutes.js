import { Router } from "express";
import {
  createOrder,
  getOrderById,
  getOrderHistory,
  getOrderSummary,
  getOrderValidators,
  listMyOrders,
  listOrders,
  orderValidators,
  patchStatusValidators,
  updateOrderStatus,
} from "../controllers/orderController.js";
import {
  requireAuth,
  requireOperator,
  requireStudent,
} from "../middleware/authMiddleware.js";

const router = Router();

// Literal paths are declared before "/:id" so they are not swallowed by the param route.
router.get("/mine", requireStudent, listMyOrders);
router.get("/summary", requireOperator, getOrderSummary);

router.get("/", requireOperator, listOrders);
router.post("/", requireStudent, orderValidators, createOrder);

// Ownership is enforced inside the handlers: an operator sees any order, a student only
// their own.
router.get("/:id", requireAuth, getOrderValidators, getOrderById);
router.get("/:id/history", requireAuth, getOrderValidators, getOrderHistory);

router.patch("/:id/status", requireOperator, patchStatusValidators, updateOrderStatus);

// DELETE is intentionally absent. Orders are cancelled via a status transition to
// "otkazano" so the audit trail the spec requires is never destroyed.

export default router;
