import { Router } from 'express';
import multer from 'multer';
import { uploadFile } from '../controllers/files.controller';

const upload = multer({ storage: multer.memoryStorage() });

export const filesRouter = Router();

filesRouter.post(
  '/upload',
  upload.single('file'),
  (req, res, next) => {
    if (req.file) {
      console.log(`[Files] Recebido arquivo para /upload: ${req.file.originalname} (${req.file.size} bytes)`);
    } else {
      console.warn(`[Files] Chamada para /upload recebida, mas sem arquivo (req.file está vazio).`);
    }
    next(); 
  },
  uploadFile 
);