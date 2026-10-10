import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { login, logout, me, refresh, register } from "./auth.controller.js";

const router = Router();

router.post("/register", register);
router.post("/login", login);
router.post("/refresh", refresh);
router.post("/logout", requireAuth, logout);
router.get("/me", requireAuth, me);

export default router;
