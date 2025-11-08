// src/routes/index.ts
import { Router } from 'express';
import { filesRouter } from './files.routes';
import { gamesRouter } from './games.routes';
import { reviewsRouter } from './reviews.routes';
import { ratingsRouter } from './ratings.routes';

export const routes = Router();

// Health check
routes.get('/health', (_req, res) => res.json({ 
  ok: true,
  timestamp: new Date().toISOString(),
  service: 'GameWebsite API',
  version: '1.0.0'
}));

// Files
routes.use('/files', filesRouter);

// Games (base routes)
routes.use('/games', gamesRouter);

// Reviews (nested under /games/:id/reviews)
routes.use('/games', reviewsRouter);

// Ratings (nested under /games/:id/like, etc)
routes.use('/games', ratingsRouter);

export default routes;