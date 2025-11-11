// src/routes/games.routes.ts
import { Router } from 'express';
import { 
  listGames, 
  getGameById, 
  createGame, 
  updateGame, 
  deleteGame, 
  getMyGames 
} from '../controllers/games.controller';

import { auth } from '../middleware/auth';
import { UserType } from '../../generated/prisma';
import multer from 'multer';


export const gamesRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { files: 4, fileSize: 50 * 1024 * 1024 }, // 50MB
});

gamesRouter.get("/", listGames);

gamesRouter.get(
  "/my-games", 
  auth({ roles: [UserType.DEV] }), 
  getMyGames
);

gamesRouter.post(
  '/', 
  auth({ roles: [UserType.DEV] }),
  upload.fields([
    { name: 'images', maxCount: 3 },
    { name: 'file', maxCount: 1 },
  ]),
  createGame
);

gamesRouter.put(
  '/:id', 
  auth({ roles: [UserType.DEV] }),
  updateGame
);

gamesRouter.delete(
  '/:id', 
  auth({ roles: [UserType.DEV] }), 
  deleteGame
);

gamesRouter.get('/:id', getGameById);