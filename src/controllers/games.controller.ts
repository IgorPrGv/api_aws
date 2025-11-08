// src/controllers/games.controller.ts
/* eslint-disable @typescript-eslint/no-explicit-any */
import { Request, Response } from 'express';
import { prisma } from '../config/prisma';
import { logCrud } from '../services/logs.storage';
import { getS3PublicUrl, deleteFromS3 } from '../services/storage.services';
import { publishGameEvent } from '../services/events.service';

export async function listGames(req: Request, res: Response) {
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
    res.json({ items: gamesWithUrls, page, pageSize, total });
  } catch (e: any) {
    console.error('Error listing games:', e);
    res.status(500).json({ error: { message: e?.message ?? 'Erro ao listar games' } });
  }
}

export async function getGameById(req: Request, res: Response) {
  try {
    const id = String(req.params.id);
    const game = await prisma.game.findUnique({ 
      where: { id },
      include: {
        images: { orderBy: { orderIndex: 'asc' } },
        developer: { select: { id: true, username: true } }
      }
    });

    if (!game) {
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
    res.json(gameWithUrls);
  } catch (e: any) {
    console.error('Error getting game:', e);
    res.status(500).json({ error: { message: e?.message ?? 'Erro ao buscar game' } });
  }
}

export async function createGame(req: Request, res: Response) {
  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      return res.status(401).json({ error: { message: 'Usuário não autenticado' } });
    }

    const { title, description, genre, s3Key, imageKeys } = req.body;

    if (!title || !description || !genre) {
      return res.status(400).json({ 
        error: { message: 'title, description e genre são obrigatórios' } 
      });
    }

    // Criar imagens se houver
    const imagesData = imageKeys && Array.isArray(imageKeys)
      ? imageKeys.map((key: string, idx: number) => ({
          s3Key: key,
          orderIndex: idx,
        }))
      : [];

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
      include: { 
        images: { orderBy: { orderIndex: 'asc' } },
        developer: { select: { username: true } }
      },
    });

    await logCrud('CREATE', { resource: 'game', id: game.id, userId });
    
    // Publicar evento no SNS
    await publishGameEvent('GAME_CREATED', {
      gameId: game.id,
      title: game.title,
      developerId: userId,
    });

    // Adicionar URLs
    const gameWithUrls = {
      ...game,
      fileUrl: game.s3Key ? getS3PublicUrl(game.s3Key) : null,
      images: game.images.map(img => ({
        ...img,
        url: getS3PublicUrl(img.s3Key),
      })),
    };

    res.status(201).json(gameWithUrls);
  } catch (e: any) {
    console.error('Error creating game:', e);
    res.status(500).json({ error: { message: e?.message ?? 'Erro ao criar game' } });
  }
}

export async function updateGame(req: Request, res: Response) {
  try {
    const id = String(req.params.id);
    const userId = (req as any).user?.id;
    const { title, description, genre } = req.body;

    if (!userId) {
      return res.status(401).json({ error: { message: 'Usuário não autenticado' } });
    }

    // Verificar se o game pertence ao usuário
    const existing = await prisma.game.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: { message: 'Game não encontrado' } });
    }

    if (existing.developerId !== userId) {
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

    await logCrud('UPDATE', { resource: 'game', id, userId });

    const gameWithUrls = {
      ...game,
      fileUrl: game.s3Key ? getS3PublicUrl(game.s3Key) : null,
      images: game.images.map(img => ({
        ...img,
        url: getS3PublicUrl(img.s3Key),
      })),
    };

    res.json(gameWithUrls);
  } catch (e: any) {
    console.error('Error updating game:', e);
    if (e?.code === 'P2025') {
      return res.status(404).json({ error: { message: 'Game não encontrado' } });
    }
    res.status(500).json({ error: { message: e?.message ?? 'Erro ao atualizar game' } });
  }
}

export async function deleteGame(req: Request, res: Response) {
  try {
    const id = String(req.params.id);
    const userId = (req as any).user?.id;

    if (!userId) {
      return res.status(401).json({ error: { message: 'Usuário não autenticado' } });
    }

    // Buscar game com imagens
    const game = await prisma.game.findUnique({ 
      where: { id },
      include: { images: true }
    });

    if (!game) {
      return res.status(404).json({ error: { message: 'Game não encontrado' } });
    }

    if (game.developerId !== userId) {
      return res.status(403).json({ error: { message: 'Você não tem permissão para deletar este game' } });
    }

    // Deletar arquivos do S3
    const deletePromises = [];
    if (game.s3Key) {
      deletePromises.push(deleteFromS3(game.s3Key));
    }
    game.images.forEach(img => {
      deletePromises.push(deleteFromS3(img.s3Key));
    });

    await Promise.allSettled(deletePromises);

    // Deletar do banco (cascade deleta imagens)
    await prisma.game.delete({ where: { id } });

    await logCrud('DELETE', { resource: 'game', id, userId });

    res.status(204).send();
  } catch (e: any) {
    console.error('Error deleting game:', e);
    if (e?.code === 'P2025') {
      return res.status(404).json({ error: { message: 'Game não encontrado' } });
    }
    res.status(500).json({ error: { message: e?.message ?? 'Erro ao excluir game' } });
  }
}

export async function getMyGames(req: Request, res: Response) {
  try {
    const userId = (req as any).user?.id;

    if (!userId) {
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

    res.json({ items: gamesWithUrls, page, pageSize, total });
  } catch (e: any) {
    console.error('Error getting my games:', e);
    res.status(500).json({ error: { message: e?.message ?? 'Erro ao listar seus games' } });
  }
}