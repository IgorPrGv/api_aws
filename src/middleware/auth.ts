/* eslint-disable @typescript-eslint/no-unused-vars */
// src/middleware/auth.ts
/* eslint-disable @typescript-eslint/no-explicit-any */
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || '';

if (!JWT_SECRET) {
  console.error('❌ JWT_SECRET não configurado!');
  process.exit(1);
}

export interface JWTPayload {
  id: string;
  userType: 'PLAYER' | 'DEV';
}

export function auth() {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const authHeader = String(req.headers.authorization || '');
      const [, token] = authHeader.split(' ');

      if (!token) {
        return res.status(401).json({ 
          error: { 
            code: 'UNAUTHENTICATED', 
            message: 'Token ausente' 
          } 
        });
      }

      const decoded = jwt.verify(token, JWT_SECRET) as JWTPayload;
      (req as any).user = decoded;
      next();
    } catch (error) {
      return res.status(401).json({ 
        error: { 
          code: 'UNAUTHENTICATED', 
          message: 'Token inválido' 
        } 
      });
    }
  };
}

export function signToken(payload: JWTPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

export function verifyToken(token: string): JWTPayload {
  return jwt.verify(token, JWT_SECRET) as JWTPayload;
}