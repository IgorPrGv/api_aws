// src/controllers/reviews.controller.ts
/* eslint-disable @typescript-eslint/no-explicit-any */
import { Request, Response } from 'express';
import { prisma } from '../config/prisma';
import { reviewsService } from '../services/dynamodb.services';
import { logCrud } from '../services/logs.storage';

export async function listReviewsByGame(req: Request, res: Response) {
  try {
    const gameId = String(req.params.id);
    const limit = Number(req.query.limit) || 20;
    const lastKey = req.query.lastKey ? JSON.parse(String(req.query.lastKey)) : undefined;

    // Buscar reviews no DynamoDB
    const result = await reviewsService.getGameReviews(gameId, limit, lastKey);

    await logCrud('READ', { 
      resource: 'review', 
      gameId, 
      count: result.items.length 
    });

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
    console.error('Error listing reviews:', e);
    res.status(500).json({ error: { message: e?.message ?? 'Erro ao listar reviews' } });
  }
}

export async function createReview(req: Request, res: Response) {
  try {
    const gameId = String(req.params.id);
    const userId = (req as any).user?.id;
    const { comment } = req.body as { comment: string };

    if (!userId) {
      return res.status(401).json({ error: { message: 'Usuário não autenticado' } });
    }

    if (!comment || comment.trim().length === 0) {
      return res.status(400).json({ error: { message: 'Comentário é obrigatório' } });
    }

    if (comment.length > 500) {
      return res.status(400).json({ error: { message: 'Comentário muito longo (máx 500 caracteres)' } });
    }

    // Buscar username do usuário
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { username: true }
    });

    if (!user) {
      return res.status(404).json({ error: { message: 'Usuário não encontrado' } });
    }

    // Criar review no DynamoDB
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

    res.status(201).json({
      id: review.reviewId,
      gameId: review.gameId,
      userId: review.userId,
      comment: review.comment,
      createdAt: review.createdAt,
      author: { username: review.username }
    });
  } catch (e: any) {
    console.error('Error creating review:', e);
    res.status(500).json({ error: { message: e?.message ?? 'Erro ao criar review' } });
  }
}

export async function getUserReviews(req: Request, res: Response) {
  try {
    const userId = (req as any).user?.id;

    if (!userId) {
      return res.status(401).json({ error: { message: 'Usuário não autenticado' } });
    }

    const limit = Number(req.query.limit) || 20;
    const reviews = await reviewsService.getUserReviews(userId, limit);

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
    console.error('Error getting user reviews:', e);
    res.status(500).json({ error: { message: e?.message ?? 'Erro ao listar reviews do usuário' } });
  }
}