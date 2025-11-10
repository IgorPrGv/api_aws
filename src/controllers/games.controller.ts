// src/controllers/games.controller.ts
/* eslint-disable @typescript-eslint/no-explicit-any */
import { Request, Response } from 'express';
import { prisma } from '../config/prisma';
import { z, ZodError } from 'zod'; 
import { logCrud } from '../services/logs.storage';
import { logsService } from '../services/dynamodb.services';
import { publishGameEvent } from '../services/events.service';
import { getS3PublicUrl, deleteFromS3, uploadBufferToS3 } from '../services/storage.services';
import { sendToQueue } from '../services/events.service';

const CreateGameFields = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  genre: z.string().min(1),
});

export async function createGame(req: Request, res: Response) {
  console.log('[Games] Tentativa de criar jogo (createGame)...');
  try {
    const { title, description, genre } = CreateGameFields.parse(req.body || {});
    const images = (req.files as any)?.images as Express.Multer.File[] | undefined || [];
    const file = ((req.files as any)?.file as Express.Multer.File[] | undefined)?.[0];
    const userId = (req as any).user.id; 

    console.log(`[Games] Enviando ${images.length} imagens para o S3...`);
    const imagesData = await Promise.all(
      images.slice(0, 3).map(async (f, idx) => ({
        s3Key: await uploadBufferToS3({ 
          key: `game-images/${Date.now()}-${f.originalname}`, 
          contentType: f.mimetype, 
          body: f.buffer 
        }).then(r => r.key),
        orderIndex: idx,
      }))
    );

    let s3Key: string | null = null;
    if (file) {
      console.log(`[Games] Enviando arquivo do jogo '${file.originalname}' para o S3...`);
      s3Key = await uploadBufferToS3({
        key: `game-files/${Date.now()}-${file.originalname}`,
        contentType: file.mimetype,
        body: file.buffer
      }).then(r => r.key);
    }

    // Salvar no RDS (Prisma)
    console.log(`[Games] Salvando jogo '${title}' no banco de dados (RDS)...`);
    const game = await prisma.game.create({
      data: {
        title,
        description,
        genre,
        developerId: userId,
        likes: 0,
        dislikes: 0,
        ...(s3Key ? { s3Key } : {}),
        ...(imagesData.length ? { images: { create: imagesData } } : {}),
      },
      include: { images: { orderBy: { orderIndex: 'asc' } } },
    });

    console.log(`[Games] Registando log (DynamoDB)...`);
    await logsService.log('INFO', 'GAME_CREATED', { userId: userId, gameId: game.id });
    
    console.log(`[Games] Enviando evento para fila (SQS)...`);
    await sendToQueue({
      action: 'GAME_CREATED',
      gameId: game.id,
      title: game.title,
    });

    // console.log(`[Games] Publicando evento (SNS)...`);
    // await publishNotification(
    //   `Novo jogo publicado: ${game.title} por ${userId}`,
    //   'Novo Jogo Publicado'
    // );

    const gameWithUrls = {
      ...game,
      fileUrl: game.s3Key ? getS3PublicUrl(game.s3Key) : null,
      images: game.images.map(img => ({
        ...img,
        url: getS3PublicUrl(img.s3Key),
      })),
    };

    console.log(`[Games] Jogo '${game.title}' (ID: ${game.id}) criado com sucesso.`);
    res.status(201).json(gameWithUrls);

  } catch (err: any) {
    if (err instanceof ZodError) {
      console.error("[Games] ❌ Erro de Validação (Zod) em createGame:", err.issues);
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: err.issues.map(i => i.message).join(', ') }
      });
    }
    console.error('[Games] ❌ Erro ao criar jogo:', err.message);
    await logsService.log('ERROR', 'CREATE_GAME_FAILED', { userId: (req as any).user?.id, error: err.message });
    res.status(500).json({ error: { code: 'CREATE_GAME_FAILED', message: 'Falha ao criar game' } });
  }
}

// ===============================================
// getMyGames
// ===============================================
export async function getMyGames(req: Request, res: Response) {
  console.log(`[Games] Listando "Meus Jogos"...`);
  try {
    const userId = (req as any).user?.id; 
    if (!userId) {
      console.warn(`[Games] Falha ao listar "Meus Jogos": Usuário não autenticado (401).`);
      return res.status(401).json({ error: { message: 'Usuário não autenticado' } });
    }

    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10));
    const pageSize = Math.min(50, Math.max(1, parseInt(String(req.query.pageSize || '12'), 10)));

    const [total, items] = await Promise.all([
      prisma.game.count({ where: { developerId: userId } }),
      prisma.game.findMany({
        where: { developerId: userId },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { images: { orderBy: { orderIndex: 'asc' } } },
      }),
    ]);

    const gamesWithUrls = items.map(g => ({
      ...g,
      fileUrl: g.s3Key ? getS3PublicUrl(g.s3Key) : null,
      images: g.images.map(img => ({
        ...img,
        url: getS3PublicUrl(img.s3Key),
      })),
    }));

    console.log(`[Games] "Meus Jogos" listados com sucesso. Total: ${items.length}`);
    res.json({ items: gamesWithUrls, page, pageSize, total });
  } catch (err: any) {
    console.error('[Games] ❌ Erro ao listar "Meus Jogos":', err.message);
    await logsService.log('ERROR', 'LIST_DEV_GAMES_FAILED', { userId: (req as any).user?.id, error: err.message });
    res.status(500).json({ error: { code: 'LIST_DEV_GAMES_FAILED', message: 'Falha ao listar games do DEV' } });
  }
}

export async function listGames(req: Request, res: Response) {
  console.log('[Games] Processando listagem de jogos (listGames)...');
  try {
    const search = String(req.query.search || '').trim();
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10));
    const pageSize = Math.min(50, Math.max(1, parseInt(String(req.query.pageSize || '12'), 10)));

    const where: any = search
      ? {
          OR: [
            { title: { contains: search, mode: 'insensitive' } },
            { genre: { contains: search, mode: 'insensitive' } },
          ],
        }
      : {};

    const [total, items] = await Promise.all([
      prisma.game.count({ where }),
      prisma.game.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          images: { orderBy: { orderIndex: 'asc' } },
          developer: { select: { id: true, username: true } }
        }
      }),
    ]);

    // Adicionar URLs públicas do S3
    const gamesWithUrls = items.map(g => ({
      ...g,
      fileUrl: g.s3Key ? getS3PublicUrl(g.s3Key) : null,
      images: g.images.map(img => ({
        ...img,
        url: getS3PublicUrl(img.s3Key),
      })),
    }));

    await logCrud('READ', { resource: 'game', count: items.length, page });
    console.log(`[Games] Jogos listados com sucesso. Total: ${items.length}`);
    res.json({ items: gamesWithUrls, page, pageSize, total });
  } catch (e: any) {
    console.error('[Games] Erro ao listar jogos (listGames):', e.message);
    res.status(500).json({ error: { message: e?.message ?? 'Erro ao listar games' } });
  }
}

export async function getGameById(req: Request, res: Response) {
  const id = String(req.params.id);
  console.log(`[Games] Buscando jogo por ID: ${id}`);
  try {
    const game = await prisma.game.findUnique({ 
      where: { id },
      include: {
        images: { orderBy: { orderIndex: 'asc' } },
        developer: { select: { id: true, username: true } }
      }
    });

    if (!game) {
      console.warn(`[Games] Jogo não encontrado (404): ${id}`);
      return res.status(404).json({ error: { message: 'Game não encontrado' } });
    }

    // Adicionar URLs do S3
    const gameWithUrls = {
      ...game,
      fileUrl: game.s3Key ? getS3PublicUrl(game.s3Key) : null,
      images: game.images.map(img => ({
        ...img,
        url: getS3PublicUrl(img.s3Key),
      })),
    };

    await logCrud('READ', { resource: 'game', id });
    console.log(`[Games] Jogo '${game.title}' (ID: ${id}) encontrado.`);
    res.json(gameWithUrls);
  } catch (e: any) {
    console.error(`[Games] Erro ao buscar jogo (ID: ${id}):`, e.message);
    res.status(500).json({ error: { message: e?.message ?? 'Erro ao buscar game' } });
  }
}

export async function updateGame(req: Request, res: Response) {
  const id = String(req.params.id);
  console.log(`[Games] Tentativa de atualizar jogo ID: ${id}`);
  try {
    const userId = (req as any).user?.id;
    const { title, description, genre } = req.body; 

    if (!userId) {
      console.warn(`[Games] Falha ao atualizar jogo: Usuário não autenticado (401).`);
      return res.status(401).json({ error: { message: 'Usuário não autenticado' } });
    }

    const existing = await prisma.game.findUnique({ where: { id } });
    if (!existing) {
      console.warn(`[Games] Falha ao atualizar jogo: Jogo não encontrado (404). ID: ${id}`);
      return res.status(404).json({ error: { message: 'Game não encontrado' } });
    }

    if (existing.developerId !== userId) {
      console.warn(`[Games] Falha ao atualizar jogo: Permissão negada (403). User ${userId} não é dono do jogo ${id}.`);
      return res.status(403).json({ error: { message: 'Você não tem permissão para editar este game' } });
    }

    const game = await prisma.game.update({ 
      where: { id }, 
      data: { title, description, genre },
      include: { 
        images: { orderBy: { orderIndex: 'asc' } },
        developer: { select: { username: true } }
      }
    });

    await logsService.log('INFO', 'GAME_UPDATED', { gameId: id, userId });

    const gameWithUrls = {
      ...game,
      fileUrl: game.s3Key ? getS3PublicUrl(game.s3Key) : null,
      images: game.images.map(img => ({
        ...img,
        url: getS3PublicUrl(img.s3Key),
      })),
    };

    console.log(`[Games] Jogo '${game.title}' (ID: ${id}) atualizado com sucesso.`);
    res.json(gameWithUrls);
  } catch (e: any) {
    console.error(`[Games] Erro ao atualizar jogo (ID: ${id}):`, e.message);
    if (e?.code === 'P2025') {
      return res.status(404).json({ error: { message: 'Game não encontrado' } });
    }
    res.status(500).json({ error: { message: e?.message ?? 'Erro ao atualizar game' } });
  }
}

export async function deleteGame(req: Request, res: Response) {
  const id = String(req.params.id);
  console.log(`[Games] Tentativa de deletar jogo ID: ${id}`);
  try {
    const userId = (req as any).user?.id;

    if (!userId) {
      console.warn(`[Games] Falha ao deletar jogo: Usuário não autenticado (401).`);
      return res.status(401).json({ error: { message: 'Usuário não autenticado' } });
    }

    const game = await prisma.game.findUnique({ 
      where: { id },
      include: { images: true }
    });

    if (!game) {
      console.warn(`[Games] Falha ao deletar jogo: Jogo não encontrado (404). ID: ${id}`);
      return res.status(404).json({ error: { message: 'Game não encontrado' } });
    }

    if (game.developerId !== userId) {
      console.warn(`[Games] Falha ao deletar jogo: Permissão negada (403). User ${userId} não é dono do jogo ${id}.`);
      return res.status(403).json({ error: { message: 'Você não tem permissão para deletar este game' } });
    }

    // Deletar arquivos do S3
    console.log(`[Games] Deletando arquivos do S3 para o jogo ID: ${id}...`);
    const deletePromises = [];
    if (game.s3Key) {
      deletePromises.push(deleteFromS3(game.s3Key));
    }
    game.images.forEach(img => {
      deletePromises.push(deleteFromS3(img.s3Key));
    });

    await Promise.allSettled(deletePromises);
    console.log(`[Games] Arquivos do S3 deletados.`);

    // Deletar do banco (cascade deleta imagens)
    await prisma.game.delete({ where: { id } });

    await logsService.log('INFO', 'GAME_DELETED', { gameId: id, userId }); 

    await publishGameEvent('GAME_DELETED', { gameId: id, developerId: userId });

    console.log(`[Games] Jogo '${game.title}' (ID: ${id}) deletado com sucesso.`);
    res.status(204).send();
  } catch (e: any) {
    console.error(`[Games] Erro ao deletar jogo (ID: ${id}):`, e.message);
    if (e?.code === 'P2025') {
      return res.status(404).json({ error: { message: 'Game não encontrado' } });
    }
    res.status(500).json({ error: { message: e?.message ?? 'Erro ao excluir game' } });
  }
}