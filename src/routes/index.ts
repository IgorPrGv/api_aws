// src/routes/index.ts
import { Router, Request, Response, NextFunction } from 'express'; 
import { filesRouter } from './files.routes';
import { gamesRouter } from './games.routes';
import { reviewsRouter } from './reviews.routes';
import { ratingsRouter } from './ratings.routes';
import authRoutes from "./auth.routes";
import { downloadsRouter } from './downloads.routes';

export const routes = Router();

routes.use((req: Request, res: Response, next: NextFunction) => {
  console.log(`[API] Requisição Recebida: ${req.method} ${req.originalUrl}`);
  next(); 
});

// Health check
routes.get('/health', (_req, res) => {
  console.log('[API] Verificação /health solicitada.');
  res.json({ 
    ok: true,
    timestamp: new Date().toISOString(),
    service: 'Steam da UFC API',
    version: '1.0.0'
  });
});

routes.use("/auth", authRoutes);

routes.use('/files', filesRouter);

routes.use('/games', gamesRouter);

// Reviews (nested under /games/:id/reviews)
routes.use('/games', reviewsRouter);

// Ratings (nested under /games/:id/like, etc)
routes.use('/games', ratingsRouter);

routes.use('/downloads', downloadsRouter);

export default routes;