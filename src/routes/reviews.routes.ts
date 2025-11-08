import { Router } from 'express';
import { listReviewsByGame, createReview } from '../controllers/reviews.controller';

export const reviewsRouter = Router();

// Mantém o prefixo /games/:id/reviews quando for montado em routes/index.ts
reviewsRouter.get('/:id/reviews', listReviewsByGame);
reviewsRouter.post('/:id/reviews', createReview);
