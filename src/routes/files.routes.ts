/* eslint-disable @typescript-eslint/no-explicit-any */
// src/routes/files.routes.ts
import { Router, Request, Response } from 'express'; 
import multer from 'multer';
import { uploadAndProcessFile } from '../controllers/upload.controller'; 
import { getS3PublicUrl } from '../services/storage.services';
import { auth } from '../middleware/auth'; 

const upload = multer({ storage: multer.memoryStorage() });
export const filesRouter = Router();

filesRouter.post('/upload', auth(), upload.single('file'), async (req: Request, res: Response) => {
  console.log('[Files] Rota /upload chamada...');
  try {
    const file = (req as any).file as Express.Multer.File | undefined;
    if (!file) {
      console.warn('[Files] Falha no upload: Nenhum arquivo enviado (400).');
      return res.status(400).json({ error: { message: 'Arquivo não enviado' } });
    }

    const key = await uploadAndProcessFile(file, 'uploads');
    
    console.log(`[Files] Upload de arquivo único (ID: ${key}) concluído.`);
    return res.json({ 
      ok: true, 
      key,
      url: getS3PublicUrl(key)
    });

  } catch (err: any) {
    console.error('[Files] Erro fatal no upload de arquivo:', err.message);
    return res.status(500).json({ 
      error: { message: 'Erro ao processar o arquivo' } 
    });
  }
});