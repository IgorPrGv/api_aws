// src/controllers/ratings.controller.ts
/* eslint-disable @typescript-eslint/no-explicit-any */
import { Request, Response } from 'express';
import { prisma } from '../config/prisma';
import { ratingsService, RatingType } from '../services/dynamodb.services';
import { logCrud } from '../services/logs.storage';

export async function likeGame(req: Request, res: Response) {
  try {
    const gameId = String(req.params.id);
    const userId = (req as any).user?.id;

    if (!userId) {
      return res.status(401).json({ error: { message: 'Usuário não autenticado' } });
    }

    // Verificar rating existente
    const existing = await ratingsService.getRating(userId, gameId);
    const oldType = existing?.type;

    // Salvar no DynamoDB
    await ratingsService.setRating(userId, gameId, RatingType.LIKE);

    // Atualizar contadores no RDS
    if (!existing) {
      await prisma.game.update({ 
        where: { id: gameId }, 
        data: { likes: { increment: 1 } } 
      });
    } else if (oldType === RatingType.DISLIKE) {
      await prisma.game.update({ 
        where: { id: gameId }, 
        data: { 
          likes: { increment: 1 }, 
          dislikes: { decrement: 1 } 
        } 
      });
    }

    // Buscar contadores atualizados
    const game = await prisma.game.findUnique({ 
      where: { id: gameId }, 
      select: { likes: true, dislikes: true } 
    });

    await logCrud('UPDATE', { resource: 'rating', action: 'LIKE', userId, gameId });

    res.json({ 
      likes: game?.likes ?? 0, 
      dislikes: game?.dislikes ?? 0, 
      userRating: 'LIKE' 
    });
  } catch (e: any) {
    console.error('Error liking game:', e);
    res.status(500).json({ error: { message: e?.message ?? 'Erro ao curtir game' } });
  }
}

export async function dislikeGame(req: Request, res: Response) {
  try {
    const gameId = String(req.params.id);
    const userId = (req as any).user?.id;

    if (!userId) {
      return res.status(401).json({ error: { message: 'Usuário não autenticado' } });
    }

    const existing = await ratingsService.getRating(userId, gameId);
    const oldType = existing?.type;

    await ratingsService.setRating(userId, gameId, RatingType.DISLIKE);

    if (!existing) {
      await prisma.game.update({ 
        where: { id: gameId }, 
        data: { dislikes: { increment: 1 } } 
      });
    } else if (oldType === RatingType.LIKE) {
      await prisma.game.update({ 
        where: { id: gameId }, 
        data: { 
          dislikes: { increment: 1 }, 
          likes: { decrement: 1 } 
        } 
      });
    }

    const game = await prisma.game.findUnique({ 
      where: { id: gameId }, 
      select: { likes: true, dislikes: true } 
    });

    await logCrud('UPDATE', { resource: 'rating', action: 'DISLIKE', userId, gameId });

    res.json({ 
      likes: game?.likes ?? 0, 
      dislikes: game?.dislikes ?? 0, 
      userRating: 'DISLIKE' 
    });
  } catch (e: any) {
    console.error('Error disliking game:', e);
    res.status(500).json({ error: { message: e?.message ?? 'Erro ao descurtir game' } });
  }
}

export async function removeRating(req: Request, res: Response) {
  try {
    const gameId = String(req.params.id);
    const userId = (req as any).user?.id;

    if (!userId) {
      return res.status(401).json({ error: { message: 'Usuário não autenticado' } });
    }

    const existing = await ratingsService.getRating(userId, gameId);

    if (existing) {
      await ratingsService.deleteRating(userId, gameId);

      if (existing.type === RatingType.LIKE) {
        await prisma.game.update({ 
          where: { id: gameId }, 
          data: { likes: { decrement: 1 } } 
        });
      } else {
        await prisma.game.update({ 
          where: { id: gameId }, 
          data: { dislikes: { decrement: 1 } } 
        });
      }
    }

    const game = await prisma.game.findUnique({ 
      where: { id: gameId }, 
      select: { likes: true, dislikes: true } 
    });

    await logCrud('DELETE', { resource: 'rating', userId, gameId });

    res.json({ 
      likes: game?.likes ?? 0, 
      dislikes: game?.dislikes ?? 0, 
      userRating: null 
    });
  } catch (e: any) {
    console.error('Error removing rating:', e);
    res.status(500).json({ error: { message: e?.message ?? 'Erro ao remover avaliação' } });
  }
}

export async function getUserRating(req: Request, res: Response) {
  try {
    const gameId = String(req.params.id);
    const userId = (req as any).user?.id;

    if (!userId) {
      return res.status(401).json({ error: { message: 'Usuário não autenticado' } });
    }

    const rating = await ratingsService.getRating(userId, gameId);

    res.json({ userRating: rating?.type || null });
  } catch (e: any) {
    console.error('Error getting user rating:', e);
    res.status(500).json({ error: { message: e?.message ?? 'Erro ao obter avaliação' } });
  }
}