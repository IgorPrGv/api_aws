import { Router } from 'express';
import { listReviewsByGame, createReview } from '../controllers/reviews.controller';
import { auth } from '../middleware/auth';

export const reviewsRouter = Router();

reviewsRouter.get('/:id/reviews', listReviewsByGame);
reviewsRouter.post('/:id/reviews', auth(), createReview);
