/* eslint-disable @typescript-eslint/no-unused-vars */
// src/controllers/auth.controller.ts
/* eslint-disable @typescript-eslint/no-explicit-any */
import { Request, Response } from 'express';
import { z, ZodError } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma } from '../config/prisma';
import { auth, signToken } from '../middleware/auth';
import { UserType } from '../../generated/prisma';
import { logsService } from '../services/dynamodb.services'; 

// --- Esquemas de Validação ---
const RegisterSchema = z.object({
  username: z.string().min(3),
  password: z.string().min(6),
  userType: z.nativeEnum(UserType),
  email: z.string().email().optional(),
});

const LoginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export async function registerUser(req: Request, res: Response) {
  console.log(`[Auth] Tentativa de registro para: ${req.body.username}`);
  try {
    const { username, password, userType, email } = RegisterSchema.parse(req.body);

    const exists = await prisma.user.findUnique({ where: { username } });
    if (exists) {
      console.warn(`[Auth] Falha no registro: Username '${username}' já existe.`);
      return res.status(409).json({
        error: { code: "USERNAME_TAKEN", message: "Username já em uso" },
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        username,
        password: passwordHash,
        userType,
        ...(email ? { email } : {}),
      },
      select: {
        id: true,
        username: true,
        userType: true,
        createdAt: true,
      },
    });

    const token = signToken({ id: user.id, userType: user.userType });

    console.log(`[Auth] Usuário '${user.username}' (ID: ${user.id}) criado com sucesso.`);
    return res.status(201).json({ user, token });
  } catch (err) {
    if (err instanceof ZodError) {
      console.error("[Auth] Erro de Validação (Zod) em /register:", err.issues);
      return res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: err.issues.map((i) => i.message).join(", "),
        },
      });
    }
    console.error("[Auth] Erro Fatal em /register:", err);
    return res.status(500).json({
      error: { code: "REGISTER_FAILED", message: "Falha ao registrar usuário" },
    });
  }
}

export async function loginUser(req: Request, res: Response) {
  console.log(`[Auth] Tentativa de login para: ${req.body.username}`);
  try {
    const { username, password } = LoginSchema.parse(req.body);

    const u = await prisma.user.findUnique({ where: { username } });
    if (!u) {
      console.warn(`[Auth] Falha no login: Usuário '${username}' não encontrado.`);
      return res.status(401).json({
        error: { code: "INVALID_CREDENTIALS", message: "Credenciais inválidas" },
      });
    }

    const ok = await bcrypt.compare(password, u.password);
    if (!ok) {
      console.warn(`[Auth] Falha no login: Senha incorreta para '${username}'.`);
      return res.status(401).json({
        error: { code: "INVALID_CREDENTIALS", message: "Credenciais inválidas" },
      });
    }

    const user = {
      id: u.id,
      username: u.username,
      userType: u.userType,
      createdAt: u.createdAt,
    };

    const token = signToken({ id: u.id, userType: u.userType });

    console.log(`[Auth] Usuário '${user.username}' logado com sucesso.`);
    return res.json({ user, token });
  } catch (err) {
    if (err instanceof ZodError) {
      console.error("[Auth]  Erro de Validação (Zod) em /login:", err.issues);
      return res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: err.issues.map((i) => i.message).join(", "),
        },
      });
    }
    console.error("[Auth] Erro Fatal em /login:", err);
    return res.status(500).json({
      error: { code: "LOGIN_FAILED", message: "Falha ao autenticar usuário" },
    });
  }
}

export async function deleteAccount(req: any, res: Response) {
  const userId = req.user.id;
  console.log(`[Auth] Tentativa de exclusão de conta para: ${userId}`);

  try {
    await prisma.user.delete({
      where: { id: userId },
    });

    await logsService.log('INFO', 'USER_DELETED', { userId });

    console.log(`[Auth] Usuário ${userId} excluído com sucesso.`);
    res.status(204).send(); 
  } catch (err: any) {
    console.error(`[Auth] Erro Fatal em /auth/me (ID: ${userId}):`, err.message);
    res.status(500).json({
      error: { code: "DELETE_FAILED", message: "Falha ao excluir conta" },
    });
  }
}