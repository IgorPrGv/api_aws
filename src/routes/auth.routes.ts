// src/routes/auth.routes.ts
import { Router } from "express";
import { auth } from "../middleware/auth"; 

import { 
  registerUser, 
  loginUser, 
  deleteAccount 
} from "../controllers/auth.controller";

const authRouter = Router();

authRouter.post("/register", registerUser);

authRouter.post("/login", loginUser);

authRouter.delete("/me", auth(), deleteAccount);

export default authRouter;