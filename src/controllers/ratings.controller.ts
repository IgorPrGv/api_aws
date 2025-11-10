// src/controllers/ratings.controller.ts
/* eslint-disable @typescript-eslint/no-explicit-any */
import { Request, Response } from 'express';
import { prisma } from '../config/prisma';
import { ratingsService, RatingType } from '../services/dynamodb.services';
import { logsService } from '../services/dynamodb.services';

export async function likeGame(req: Request, res: Response) {
  const gameId = String(req.params.id);
  const userId = (req as any).user?.id;
  console.log(`[Ratings] Usuário ${userId} deu LIKE no jogo ${gameId}`);
  
  try {
    if (!userId) {
      console.warn(`[Ratings] Falha no LIKE: Usuário não autenticado (401).`);
      return res.status(401).json({ error: { message: 'Usuário não autenticado' } });
    }

    // Verificar rating existente
    const existing = await ratingsService.getRating(userId, gameId);
    const oldType = existing?.type;

    // Salvar no DynamoDB
    console.log(`[Ratings] Salvando LIKE no DynamoDB...`);
    await ratingsService.setRating(userId, gameId, RatingType.LIKE);

    // Atualizar contadores no RDS
    console.log(`[Ratings] Atualizando contadores (Likes) no RDS...`);
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

    await logsService.log('GAME_LIKED', { userId, gameId });
    console.log(`[Ratings] LIKE no jogo ${gameId} registrado com sucesso.`);
    res.json({ 
      likes: game?.likes ?? 0, 
      dislikes: game?.dislikes ?? 0, 
      userRating: 'LIKE' 
    });
  } catch (e: any) {
    console.error(`[Ratings] Erro ao dar LIKE no jogo ${gameId}:`, e.message);
    res.status(500).json({ error: { message: e?.message ?? 'Erro ao curtir game' } });
  }
}

export async function dislikeGame(req: Request, res: Response) {
  const gameId = String(req.params.id);
  const userId = (req as any).user?.id;
  console.log(`[Ratings] Usuário ${userId} deu DISLIKE no jogo ${gameId}`);
  
  try {
    if (!userId) {
      console.warn(`[Ratings] Falha no DISLIKE: Usuário não autenticado (401).`);
      return res.status(401).json({ error: { message: 'Usuário não autenticado' } });
    }

    const existing = await ratingsService.getRating(userId, gameId);
    const oldType = existing?.type;

    console.log(`[Ratings] Salvando DISLIKE no DynamoDB...`);
    await ratingsService.setRating(userId, gameId, RatingType.DISLIKE);

    console.log(`[Ratings] Atualizando contadores (Dislikes) no RDS...`);
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

    await logsService.log('GAME_DISLIKED', { userId, gameId });
    console.log(`[Ratings] DISLIKE no jogo ${gameId} registrado com sucesso.`);
    res.json({ 
      likes: game?.likes ?? 0, 
      dislikes: game?.dislikes ?? 0, 
      userRating: 'DISLIKE' 
    });
  } catch (e: any) {
    console.error(`[Ratings] Erro ao dar DISLIKE no jogo ${gameId}:`, e.message);
    res.status(500).json({ error: { message: e?.message ?? 'Erro ao descurtir game' } });
  }
}

export async function removeRating(req: Request, res: Response) {
  const gameId = String(req.params.id);
  const userId = (req as any).user?.id;
  console.log(`[Ratings] Usuário ${userId} removeu o rating do jogo ${gameId}`);
  
  try {
    if (!userId) {
      console.warn(`[Ratings] Falha ao remover rating: Usuário não autenticado (401).`);
      return res.status(401).json({ error: { message: 'Usuário não autenticado' } });
    }

    const existing = await ratingsService.getRating(userId, gameId);

    if (existing) {
      console.log(`[Ratings] Deletando rating do DynamoDB...`);
      await ratingsService.deleteRating(userId, gameId);

      console.log(`[Ratings] Atualizando contadores (Remoção) no RDS...`);
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
    } else {
      console.log(`[Ratings] Usuário ${userId} tentou remover rating, mas nenhum existia.`);
    }

    const game = await prisma.game.findUnique({ 
      where: { id: gameId }, 
      select: { likes: true, dislikes: true } 
    });

    await logsService.log('RATING_REMOVED', { userId, gameId });
    console.log(`[Ratings] Rating do jogo ${gameId} removido com sucesso.`);
    res.json({ 
      likes: game?.likes ?? 0, 
      dislikes: game?.dislikes ?? 0, 
      userRating: null 
    });
  } catch (e: any) {
    console.error(`[Ratings] Erro ao remover rating do jogo ${gameId}:`, e.message);
    res.status(500).json({ error: { message: e?.message ?? 'Erro ao remover avaliação' } });
  }
}

export async function getUserRating(req: Request, res: Response) {
  const gameId = String(req.params.id);
  const userId = (req as any).user?.id;
  console.log(`[Ratings] Buscando rating do usuário ${userId} para o jogo ${gameId}`);
  
  try {
    if (!userId) {
      console.warn(`[Ratings] Falha ao buscar rating: Usuário não autenticado (401).`);
      return res.status(401).json({ error: { message: 'Usuário não autenticado' } });
    }

    const rating = await ratingsService.getRating(userId, gameId);
    console.log(`[Ratings] Rating do usuário ${userId} para o jogo ${gameId} encontrado: ${rating?.type || 'null'}.`);
    res.json({ userRating: rating?.type || null });
  } catch (e: any) {
    console.error(`[Ratings] Erro ao buscar rating do usuário ${userId} para o jogo ${gameId}:`, e.message);
    res.status(500).json({ error: { message: e?.message ?? 'Erro ao obter avaliação' } });
  }
}