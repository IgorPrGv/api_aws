// src/controllers/reviews.controller.ts
/* eslint-disable @typescript-eslint/no-explicit-any */
import { Request, Response } from 'express';
import { prisma } from '../config/prisma';
import { reviewsService } from '../services/dynamodb.services';
import { logCrud } from '../services/logs.storage';

export async function listReviewsByGame(req: Request, res: Response) {
  const gameId = String(req.params.id);
  console.log(`[Reviews] Listando reviews para o jogo ${gameId}...`);
  try {
    const limit = Number(req.query.limit) || 20;
    const lastKey = req.query.lastKey ? JSON.parse(String(req.query.lastKey)) : undefined;

    // Buscar reviews no DynamoDB
    console.log(`[Reviews] Buscando reviews no DynamoDB...`);
    const result = await reviewsService.getGameReviews(gameId, limit, lastKey);

    await logCrud('READ', { 
      resource: 'review', 
      gameId, 
      count: result.items.length 
    });

    console.log(`[Reviews] ${result.items.length} reviews encontradas para o jogo ${gameId}.`);
    res.json({ 
      items: result.items.map(r => ({
        id: r.reviewId,
        gameId: r.gameId,
        userId: r.userId,
        comment: r.comment,
        createdAt: r.createdAt,
        author: { username: r.username }
      })),
      lastKey: result.lastKey,
      hasMore: !!result.lastKey
    });
  } catch (e: any) {
    console.error(`[Reviews] Erro ao listar reviews do jogo ${gameId}:`, e.message);
    res.status(500).json({ error: { message: e?.message ?? 'Erro ao listar reviews' } });
  }
}

export async function createReview(req: Request, res: Response) {
  const gameId = String(req.params.id);
  const userId = (req as any).user?.id;
  console.log(`[Reviews] Usuário ${userId} tentando criar review para o jogo ${gameId}...`);
  
  try {
    const { comment } = req.body as { comment: string };

    if (!userId) {
      console.warn(`[Reviews] Falha ao criar review: Usuário não autenticado (401).`);
      return res.status(401).json({ error: { message: 'Usuário não autenticado' } });
    }

    if (!comment || comment.trim().length === 0) {
      console.warn(`[Reviews] Falha ao criar review: Comentário vazio (400).`);
      return res.status(400).json({ error: { message: 'Comentário é obrigatório' } });
    }

    if (comment.length > 500) {
      console.warn(`[Reviews] Falha ao criar review: Comentário muito longo (400).`);
      return res.status(400).json({ error: { message: 'Comentário muito longo (máx 500 caracteres)' } });
    }

    // Buscar username do usuário
    console.log(`[Reviews] Buscando username do usuário ${userId} no RDS...`);
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { username: true }
    });

    if (!user) {
      console.warn(`[Reviews] Falha ao criar review: Usuário ${userId} não encontrado no RDS (404).`);
      return res.status(404).json({ error: { message: 'Usuário não encontrado' } });
    }

    // Criar review no DynamoDB
    console.log(`[Reviews] Salvando review no DynamoDB...`);
    const review = await reviewsService.createReview(
      gameId,
      userId,
      user.username,
      comment.trim()
    );

    await logCrud('CREATE', { 
      resource: 'review', 
      id: review.reviewId, 
      gameId, 
      userId 
    });

    console.log(`[Reviews] Review (ID: ${review.reviewId}) criado com sucesso para o jogo ${gameId}.`);
    res.status(201).json({
      id: review.reviewId,
      gameId: review.gameId,
      userId: review.userId,
      comment: review.comment,
      createdAt: review.createdAt,
      author: { username: review.username }
    });
  } catch (e: any) {
    console.error(`[Reviews] Erro ao criar review para o jogo ${gameId}:`, e.message);
    res.status(500).json({ error: { message: e?.message ?? 'Erro ao criar review' } });
  }
}

export async function getUserReviews(req: Request, res: Response) {
  const userId = (req as any).user?.id;
  console.log(`[Reviews] Listando reviews do usuário ${userId}...`);
  
  try {
    if (!userId) {
      console.warn(`[Reviews] Falha ao listar reviews: Usuário não autenticado (401).`);
      return res.status(401).json({ error: { message: 'Usuário não autenticado' } });
    }

    const limit = Number(req.query.limit) || 20;
    console.log(`[Reviews] Buscando reviews do usuário ${userId} no DynamoDB...`);
    const reviews = await reviewsService.getUserReviews(userId, limit);

    console.log(`[Reviews] ${reviews.length} reviews encontradas para o usuário ${userId}.`);
    res.json({
      items: reviews.map(r => ({
        id: r.reviewId,
        gameId: r.gameId,
        userId: r.userId,
        comment: r.comment,
        createdAt: r.createdAt,
        author: { username: r.username }
      }))
    });
  } catch (e: any) {
    console.error(`[Reviews] Erro ao listar reviews do usuário ${userId}:`, e.message);
    res.status(500).json({ error: { message: e?.message ?? 'Erro ao listar reviews do usuário' } });
  }
}