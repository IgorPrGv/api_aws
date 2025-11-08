// src/routes/ratings.routes.ts
import { Router } from 'express';
import { 
  likeGame, 
  dislikeGame, 
  removeRating,
  getUserRating 
} from '../controllers/ratings.controller';
import { auth } from '../middleware/auth';

export const ratingsRouter = Router();

ratingsRouter.post('/:id/like', auth(), likeGame);
ratingsRouter.post('/:id/dislike', auth(), dislikeGame);
ratingsRouter.delete('/:id/rating', auth(), removeRating);
ratingsRouter.get('/:id/rating', auth(), getUserRating);