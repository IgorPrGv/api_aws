// src/controllers/files.controller.ts
/* eslint-disable @typescript-eslint/no-explicit-any */
import { Request, Response } from 'express';
import crypto from 'crypto';
import { uploadBufferToS3, uploadMultipleToS3, getS3PublicUrl } from '../services/storage.services';
import { publishUploadEvent } from '../services/events.service';
import { logCrud } from '../services/logs.storage';

export async function uploadFile(req: Request, res: Response) {
  try {
    const file = (req as any).file as Express.Multer.File | undefined;
    if (!file) {
      return res.status(400).json({ error: { message: 'Arquivo não enviado' } });
    }

    const fileName = file.originalname;
    const ext = fileName.includes('.') ? fileName.split('.').pop() : 'bin';
    const key = `uploads/${Date.now()}-${crypto.randomUUID()}.${ext}`;

    // Upload para S3
    await uploadBufferToS3({ 
      key, 
      contentType: file.mimetype, 
      body: file.buffer 
    });

    // Publicar evento no SNS
    await publishUploadEvent(fileName, key);

    // Log no DynamoDB
    await logCrud('UPLOAD', { fileName, key, size: file.size });

    return res.json({ 
      ok: true, 
      key,
      url: getS3PublicUrl(key)
    });
  } catch (err: any) {
    console.error('Upload error:', err);
    return res.status(500).json({ 
      error: { message: 'Erro ao processar o arquivo' } 
    });
  }
}

export async function uploadMultipleFiles(req: Request, res: Response) {
  try {
    const files = (req as any).files as Express.Multer.File[] | undefined;
    
    if (!files || files.length === 0) {
      return res.status(400).json({ error: { message: 'Nenhum arquivo enviado' } });
    }

    const folder = String(req.body.folder || 'uploads');
    const keys = await uploadMultipleToS3(files, folder);

    await logCrud('UPLOAD', { 
      count: files.length, 
      folder,
      keys 
    });

    return res.json({ 
      ok: true, 
      keys,
      urls: keys.map(k => getS3PublicUrl(k))
    });
  } catch (err: any) {
    console.error('Multiple upload error:', err);
    return res.status(500).json({ 
      error: { message: 'Erro ao processar os arquivos' } 
    });
  }
}

export async function uploadGameFiles(req: Request, res: Response) {
  try {
    const files = (req as any).files;
    
    if (!files) {
      return res.status(400).json({ error: { message: 'Nenhum arquivo enviado' } });
    }

    const images = files.images as Express.Multer.File[] | undefined;
    const gameFile = files.file as Express.Multer.File[] | undefined;

    const result: any = {};

    // Upload das imagens
    if (images && images.length > 0) {
      const imageKeys = await uploadMultipleToS3(images.slice(0, 3), 'game-images');
      result.imageKeys = imageKeys;
      result.imageUrls = imageKeys.map(k => getS3PublicUrl(k));
    }

    // Upload do arquivo do game
    if (gameFile && gameFile.length > 0) {
      const file = gameFile[0];
      if (file) {
        const ext = file.originalname.includes('.') ? file.originalname.split('.').pop() : 'bin';
        const key = `game-files/${Date.now()}-${crypto.randomUUID()}.${ext}`;
        
        await uploadBufferToS3({
          key,
          contentType: file.mimetype,
          body: file.buffer,
        });

        result.s3Key = key;
        result.fileUrl = getS3PublicUrl(key);
      }
    }

    await logCrud('UPLOAD', { 
      type: 'game_files',
      imageCount: images?.length || 0,
      hasGameFile: !!gameFile
    });

    return res.json(result);
  } catch (err: any) {
    console.error('Game files upload error:', err);
    return res.status(500).json({ 
      error: { message: 'Erro ao processar arquivos do game' } 
    });
  }
}