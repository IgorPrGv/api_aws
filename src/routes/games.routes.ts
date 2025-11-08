import { Router } from 'express';
import { listGames, getGameById, createGame, updateGame, deleteGame } from '../controllers/games.controller';

export const gamesRouter = Router();

gamesRouter.get('/', listGames);
gamesRouter.get('/:id', getGameById);
gamesRouter.post('/', createGame);
gamesRouter.put('/:id', updateGame);
gamesRouter.delete('/:id', deleteGame);
