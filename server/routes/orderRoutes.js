import { Router } from "express";
import {
  createOrder,
  deleteOrder,
  deleteOrderValidators,
  getOrderById,
  getOrderValidators,
  listOrders,
  orderValidators,
  patchOrderValidators,
  updateOrderStatus,
} from "../controllers/orderController.js";
import { requireAdmin } from "../middleware/adminMiddleware.js";

const router = Router();

router.get("/", requireAdmin, listOrders);
router.get("/:id", requireAdmin, getOrderValidators, getOrderById);
router.post("/", orderValidators, createOrder);
router.delete(
  "/:id",
  requireAdmin,
  deleteOrderValidators,
  deleteOrder
);
router.patch(
  "/:id",
  requireAdmin,
  patchOrderValidators,
  updateOrderStatus
);

export default router;
