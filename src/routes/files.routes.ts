import { Router } from 'express';
import multer from 'multer';
import { uploadFile } from '../controllers/files.controller';

const upload = multer({ storage: multer.memoryStorage() });

export const filesRouter = Router();
filesRouter.post('/upload', upload.single('file'), uploadFile);
