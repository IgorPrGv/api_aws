/* eslint-disable @typescript-eslint/no-explicit-any */
// src/services/dynamodb.service.ts
import { ddb } from '../config/aws';
import {
  PutCommand,
  GetCommand,
  DeleteCommand,
  QueryCommand, BatchWriteCommand
} from '@aws-sdk/lib-dynamodb';

// ===================== TYPES =====================
export enum RatingType {
  LIKE = 'LIKE',
  DISLIKE = 'DISLIKE',
}

export interface Rating {
  PK: string; // USER#<userId>
  SK: string; // GAME#<gameId>
  type: RatingType;
  gameId: string;
  userId: string;
  createdAt: string;
  GSI1PK: string; // GAME#<gameId>
  GSI1SK: string; // USER#<userId>
}

export interface Review {
  PK: string; // GAME#<gameId>
  SK: string; // REVIEW#<timestamp>#<reviewId>
  reviewId: string;
  gameId: string;
  userId: string;
  username: string;
  comment: string;
  createdAt: string;
  GSI1PK: string; // USER#<userId>
  GSI1SK: string; // REVIEW#<timestamp>
}

// ===================== TABLE NAMES =====================
const RATINGS_TABLE = process.env.DDB_TABLE_RATINGS || 'GameRatings';
const REVIEWS_TABLE = process.env.DDB_TABLE_REVIEWS || 'GameReviews';

// ===================== RATINGS SERVICE =====================
export class RatingsService {
  async setRating(userId: string, gameId: string, type: RatingType): Promise<Rating> {
    const now = new Date().toISOString();
    const rating: Rating = {
      PK: `USER#${userId}`,
      SK: `GAME#${gameId}`,
      type,
      gameId,
      userId,
      createdAt: now,
      GSI1PK: `GAME#${gameId}`,
      GSI1SK: `USER#${userId}`,
    };

    await ddb.send(
      new PutCommand({
        TableName: RATINGS_TABLE,
        Item: rating,
      }),
    );

    return rating;
  }

  async getRating(userId: string, gameId: string): Promise<Rating | null> {
    const result = await ddb.send(
      new GetCommand({
        TableName: RATINGS_TABLE,
        Key: {
          PK: `USER#${userId}`,
          SK: `GAME#${gameId}`,
        },
      }),
    );

    return (result.Item as Rating) || null;
  }

  async deleteRating(userId: string, gameId: string): Promise<void> {
    await ddb.send(
      new DeleteCommand({
        TableName: RATINGS_TABLE,
        Key: {
          PK: `USER#${userId}`,
          SK: `GAME#${gameId}`,
        },
      }),
    );
  }

  async getGameRatings(gameId: string): Promise<Rating[]> {
    const result = await ddb.send(
      new QueryCommand({
        TableName: RATINGS_TABLE,
        IndexName: 'GSI1',
        KeyConditionExpression: 'GSI1PK = :pk',
        ExpressionAttributeValues: {
          ':pk': `GAME#${gameId}`,
        },
      }),
    );

    return (result.Items as Rating[]) || [];
  }

  async getGameRatingCounts(gameId: string): Promise<{ likes: number; dislikes: number }> {
    const ratings = await this.getGameRatings(gameId);
    const likes = ratings.filter(r => r.type === RatingType.LIKE).length;
    const dislikes = ratings.filter(r => r.type === RatingType.DISLIKE).length;
    return { likes, dislikes };
  }

  async deleteAllRatingsForGame(gameId: string): Promise<number> {
    // todos os ratings para este jogo usando o GSI1
    const ratings = await this.getGameRatings(gameId);
    
    if (ratings.length === 0) return 0;

    // um lote de 'DeleteRequest'
    const deleteRequests = ratings.map(r => ({
      DeleteRequest: {
        Key: {
          PK: r.PK, // (Ex: USER#123)
          SK: r.SK, // (Ex: GAME#456)
        },
      },
    }));

    // Enviar em lotes de 25 
    let deletedCount = 0;
    for (let i = 0; i < deleteRequests.length; i += 25) {
      const batch = deleteRequests.slice(i, i + 25);
      await ddb.send(
        new BatchWriteCommand({ 
          RequestItems: {
            [RATINGS_TABLE]: batch,
          },
        }),
      );
      deletedCount += batch.length;
    }
    
    return deletedCount;
  }
}

// ===================== REVIEWS SERVICE =====================
export class ReviewsService {
  async createReview(
    gameId: string,
    userId: string,
    username: string,
    comment: string,
  ): Promise<Review> {
    const now = new Date();
    const timestamp = now.getTime();
    const reviewId = `${timestamp}-${Math.random().toString(36).substr(2, 9)}`;

    const review: Review = {
      PK: `GAME#${gameId}`,
      SK: `REVIEW#${timestamp}#${reviewId}`,
      reviewId,
      gameId,
      userId,
      username,
      comment,
      createdAt: now.toISOString(),
      GSI1PK: `USER#${userId}`,
      GSI1SK: `REVIEW#${timestamp}`,
    };

    await ddb.send(
      new PutCommand({
        TableName: REVIEWS_TABLE,
        Item: review,
      }),
    );

    return review;
  }

  async getGameReviews(
    gameId: string,
    limit: number = 20,
    lastKey?: unknown,
  ): Promise<{ items: Review[]; lastKey?: unknown }> {
    const result = await ddb.send(
      new QueryCommand({
        TableName: REVIEWS_TABLE,
        KeyConditionExpression: 'PK = :pk',
        ExpressionAttributeValues: {
          ':pk': `GAME#${gameId}`,
        },
        ScanIndexForward: false, 
        Limit: limit,
        ExclusiveStartKey: lastKey as Record<string, any> | undefined,
      }),
    );

    return {
      items: (result.Items as Review[]) || [],
      lastKey: result.LastEvaluatedKey,
    };
  }

  async getUserReviews(userId: string, limit: number = 20): Promise<Review[]> {
    // 8. Usa a sintaxe v3 ddb.send(...)
    const result = await ddb.send(
      new QueryCommand({
        TableName: REVIEWS_TABLE,
        IndexName: 'GSI1',
        KeyConditionExpression: 'GSI1PK = :pk',
        ExpressionAttributeValues: {
          ':pk': `USER#${userId}`,
        },
        ScanIndexForward: false,
        Limit: limit,
      }),
    );

    return (result.Items as Review[]) || [];
  }

  async deleteReview(gameId: string, reviewSK: string): Promise<void> {
    await ddb.send(
      new DeleteCommand({
        TableName: REVIEWS_TABLE,
        Key: {
          PK: `GAME#${gameId}`,
          SK: reviewSK,
        },
      }),
    );
  }

  async deleteAllReviewsForGame(gameId: string): Promise<number> {
    const { items } = await this.getGameReviews(gameId, 1000); 

    if (items.length === 0) return 0;

    const deleteRequests = items.map(r => ({
      DeleteRequest: {
        Key: {
          PK: r.PK, 
          SK: r.SK, 
        },
      },
    }));
    
    let deletedCount = 0;
    for (let i = 0; i < deleteRequests.length; i += 25) {
      const batch = deleteRequests.slice(i, i + 25);
      await ddb.send(
        new BatchWriteCommand({ 
          RequestItems: {
            [REVIEWS_TABLE]: batch,
          },
        }),
      );
      deletedCount += batch.length;
    }
    
    return deletedCount;
  }
}

// ===================== LOGS SERVICE =====================
export class LogsService {
  /**
   * @param action O tipo de ação 
   * @param element Os dados manipulados 
   */
  async log(
    action: string,
    element?: unknown, 
  ): Promise<void> {
    
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[LOG_BYPASS] Ação: ${action}`, element || '');
      return; 
    }

    const now = new Date();
    const logId = `${now.getTime()}-${Math.random().toString(36).substr(2, 9)}`;
    const logTable = process.env.DDB_TABLE_CRUD || 'crud_logs';

    const log = {
      operation_id: logId, 
      action,
      element: element || null,
      timestamp: now.toISOString(),
    };

    try {
      await ddb.send(
        new PutCommand({
          TableName: logTable,
          Item: log,
        }),
      );
    } catch (error) {
      console.error('Error logging to DynamoDB:', error);
    }
  }
}

// ===================== EXPORTS =====================
export const logsService = new LogsService();
export const ratingsService = new RatingsService();
export const reviewsService = new ReviewsService();