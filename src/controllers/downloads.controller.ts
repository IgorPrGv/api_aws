/* eslint-disable @typescript-eslint/no-explicit-any */
import { Request, Response } from 'express';
import { prisma } from '../config/prisma';
import { z, ZodError } from 'zod';
import { logsService } from '../services/dynamodb.services';
import { getS3PublicUrl } from '../services/storage.services';

// Esquema de validação (copiado do monolito)
const AddDownloadSchema = z.object({ gameId: z.string().min(1) });

export async function addDownload(req: Request, res: Response) {
  const userId = (req as any).user?.id;
  console.log(`[Downloads] Usuário ${userId} tentando adicionar jogo à biblioteca...`);
  try {
    const { gameId } = AddDownloadSchema.parse(req.body);
    
    if (!userId) {
      console.warn(`[Downloads] Falha ao adicionar: Usuário não autenticado (401).`);
      return res.status(401).json({ error: { message: 'Usuário não autenticado' } });
    }
    
    const existing = await prisma.download.findFirst({
      where: { userId: userId, gameId }
    });
    
    if (existing) {
      console.warn(`[Downloads] Jogo ${gameId} já está na biblioteca do usuário ${userId} (409).`);
      return res.status(409).json({ error: { code: 'ALREADY_IN_LIBRARY', message: 'Jogo já está na biblioteca' } });
    }
    
    const dl = await prisma.download.create({
      data: { userId: userId, gameId, downloadDate: new Date() },
      select: { id: true, gameId: true, userId: true, downloadDate: true },
    });
    
    await logsService.log('INFO', 'GAME_ADDED_TO_LIBRARY', { userId: userId, gameId });
    console.log(`[Downloads] Jogo ${gameId} adicionado à biblioteca do usuário ${userId}.`);
    res.status(201).json(dl);

  } catch (err: any) {
    if (err instanceof ZodError) {
      console.error("[Downloads] Erro de Validação (Zod) em addDownload:", err.issues);
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: err.issues.map(i => i.message).join(', ') }
      });
    }
    console.error(`[Downloads] Erro ao adicionar jogo à biblioteca:`, err.message);
    await logsService.log('ERROR', 'ADD_DOWNLOAD_FAILED', { userId, error: err.message });
    res.status(500).json({ error: { code: 'ADD_DOWNLOAD_FAILED', message: 'Falha ao salvar na biblioteca' } });
  }
}

export async function getDownloads(req: Request, res: Response) {
  const userId = (req as any).user?.id;
  console.log(`[Downloads] Listando biblioteca (downloads) do usuário ${userId}...`);
  try {
    if (!userId) {
      console.warn(`[Downloads] Falha ao listar: Usuário não autenticado (401).`);
      return res.status(401).json({ error: { message: 'Usuário não autenticado' } });
    }

    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10));
    const pageSize = Math.min(50, Math.max(1, parseInt(String(req.query.pageSize || '12'), 10)));
    
    const [total, items] = await Promise.all([
      prisma.download.count({ where: { userId: userId } }),
      prisma.download.findMany({
        where: { userId: userId },
        orderBy: { downloadDate: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { 
          game: { 
            include: { 
              images: { orderBy: { orderIndex: 'asc' }, take: 1 },
              developer: { select: { username: true } }
            } 
          } 
        },
      }),
    ]);
    
    // Adicionar URLs públicas do S3
    const downloadsWithUrls = items.map(d => ({
      ...d,
      game: {
        ...d.game,
        fileUrl: d.game.s3Key ? getS3PublicUrl(d.game.s3Key) : null,
        images: d.game.images.map(img => ({
          ...img,
          url: getS3PublicUrl(img.s3Key),
        })),
      },
    }));
    
    console.log(`[Downloads] Biblioteca do usuário ${userId} listada com sucesso. Total: ${items.length}`);
    res.json({ items: downloadsWithUrls, total, page, pageSize });

  } catch (err: any) {
    console.error(`[Downloads] Erro ao listar biblioteca:`, err.message);
    await logsService.log('ERROR', 'LIST_DOWNLOADS_FAILED', { userId, error: err.message });
    res.status(500).json({ error: { code: 'LIST_DOWNLOADS_FAILED', message: 'Falha ao listar biblioteca' } });
  }
}

export async function deleteDownload(req: Request, res: Response) {
  const userId = (req as any).user?.id;
  const id = String(req.params.id); // ID do *download*, não do jogo
  console.log(`[Downloads] Usuário ${userId} tentando deletar download ID: ${id}...`);
  try {
    if (!userId) {
      console.warn(`[Downloads] Falha ao deletar: Usuário não autenticado (401).`);
      return res.status(401).json({ error: { message: 'Usuário não autenticado' } });
    }

    // O deleteMany garante que o usuário só possa deletar o *seu* download
    await prisma.download.deleteMany({ where: { id, userId: userId } });
    
    await logsService.log('INFO', 'GAME_REMOVED_FROM_LIBRARY', { userId: userId, downloadId: id });
    console.log(`[Downloads] Download ID: ${id} deletado com sucesso.`);
    res.status(204).send();

  } catch (err: any) {
    console.error(`[Downloads] Erro ao deletar download ID: ${id}:`, err.message);
    await logsService.log('ERROR', 'DELETE_DOWNLOAD_FAILED', { userId, downloadId: req.params.id, error: err.message });
    res.status(500).json({ error: { code: 'DELETE_DOWNLOAD_FAILED', message: 'Falha ao remover da biblioteca' } });
  }
}