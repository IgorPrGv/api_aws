import { Router } from 'express';
import { auth } from '../middleware/auth';
import { addDownload, getDownloads, deleteDownload } from '../controllers/downloads.controller';

export const downloadsRouter = Router();

// Todas as rotas de /downloads exigem autenticação
downloadsRouter.use(auth());

downloadsRouter.post('/', addDownload);
downloadsRouter.get('/', getDownloads);
downloadsRouter.delete('/:id', deleteDownload);

export default downloadsRouter;