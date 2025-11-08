/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
// server.ts - AWS Integrated
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import { z, ZodError } from 'zod';
import { PrismaClient, UserType } from '../generated/prisma';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { ratingsService, reviewsService, logsService, RatingType } from './services/dynamodb.services';

const app = express();
const prisma = new PrismaClient();

// ===================== AWS CLIENTS =====================
const s3Client = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });
const snsClient = new SNSClient({ region: process.env.AWS_REGION || 'us-east-1' });
const sqsClient = new SQSClient({ region: process.env.AWS_REGION || 'us-east-1' });

// ===================== ENV =====================
const PORT = Number(process.env.PORT || 4000);
const JWT_SECRET = process.env.JWT_SECRET || '';
if (!JWT_SECRET) {
  console.error('JWT_SECRET missing');
  process.exit(1);
}
const FRONT_ORIGIN = process.env.FRONT_ORIGIN || 'http://localhost:5173';
const S3_BUCKET = process.env.S3_BUCKET || '';
const SNS_TOPIC_ARN = process.env.SNS_TOPIC_ARN || '';
const SQS_QUEUE_URL = process.env.SQS_QUEUE_URL || '';

// ===================== BASE =====================
app.use(cors({ origin: FRONT_ORIGIN, credentials: true }));
app.use(express.json({ limit: '5mb' }));

// ===================== UPLOAD (Memory) =====================
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { files: 4, fileSize: 50 * 1024 * 1024 }, // 50MB
});

// ===================== S3 HELPERS =====================
async function uploadToS3(file: Express.Multer.File, folder: string): Promise<string> {
  const key = `${folder}/${Date.now()}-${file.originalname.replace(/[^\w.-]+/g, '_')}`;
  
  await s3Client.send(new PutObjectCommand({
    Bucket: S3_BUCKET,
    Key: key,
    Body: file.buffer,
    ContentType: file.mimetype,
  }));

  return key;
}

async function deleteFromS3(key: string): Promise<void> {
  await s3Client.send(new DeleteObjectCommand({
    Bucket: S3_BUCKET,
    Key: key,
  }));
}

function getS3Url(key: string): string {
  return `https://${S3_BUCKET}.s3.amazonaws.com/${key}`;
}

// ===================== SNS HELPER =====================
async function publishNotification(message: string, subject: string): Promise<void> {
  if (!SNS_TOPIC_ARN) return;
  
  await snsClient.send(new PublishCommand({
    TopicArn: SNS_TOPIC_ARN,
    Message: message,
    Subject: subject,
  }));
}

// ===================== SQS HELPER =====================
async function sendToQueue(messageBody: any): Promise<void> {
  if (!SQS_QUEUE_URL) return;
  
  await sqsClient.send(new SendMessageCommand({
    QueueUrl: SQS_QUEUE_URL,
    MessageBody: JSON.stringify(messageBody),
  }));
}

// ===================== AUTH MIDDLEWARE =====================
type JWTPayload = { id: string; userType: UserType };
const signToken = (p: JWTPayload) => jwt.sign(p, JWT_SECRET, { expiresIn: '7d' });

const auth =
  (opts?: { roles?: Array<UserType> }) =>
  (req: any, res: express.Response, next: express.NextFunction) => {
    try {
      const authH = String(req.headers.authorization || '');
      const [, token] = authH.split(' ');
      if (!token) {
        return res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Token ausente' } });
      }
      const decoded = jwt.verify(token, JWT_SECRET) as JWTPayload;
      if (opts?.roles && !opts.roles.includes(decoded.userType)) {
        return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Acesso negado' } });
      }
      req.user = decoded;
      next();
    } catch {
      return res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Token inválido' } });
    }
  };

// ===================== HEALTH =====================
app.get('/health', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ ok: true, db: 'connected', timestamp: new Date().toISOString() });
  } catch {
    res.status(503).json({ ok: false, db: 'disconnected' });
  }
});

// ===================== AUTH =====================
const RegisterSchema = z.object({
  username: z.string().min(3),
  password: z.string().min(6),
  userType: z.nativeEnum(UserType),
  email: z.string().email().optional(),
});

app.post('/auth/register', async (req, res) => {
  try {
    const { username, password, userType, email } = RegisterSchema.parse(req.body);

    const dup = await prisma.user.findUnique({ where: { username } });
    if (dup) {
      return res.status(409).json({ error: { code: 'USERNAME_TAKEN', message: 'Username já em uso' } });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { 
        username, 
        password: passwordHash, 
        userType,
        ...(email ? { email } : {})
      },
      select: { id: true, username: true, userType: true, createdAt: true },
    });

    const token = signToken({ id: user.id, userType: user.userType });
    
    await logsService.log('INFO', 'USER_REGISTERED', { userId: user.id, userType: user.userType });
    
    res.status(201).json({ user, token });
  } catch (err: any) {
    if (err instanceof ZodError) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: err.issues.map(i => i.message).join(', ') }
      });
    }
    await logsService.log('ERROR', 'REGISTER_FAILED', { error: err.message });
    res.status(500).json({ error: { code: 'REGISTER_FAILED', message: 'Falha ao registrar' } });
  }
});

const LoginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

app.post('/auth/login', async (req, res) => {
  try {
    const { username, password } = LoginSchema.parse(req.body);
    const u = await prisma.user.findUnique({ where: { username } });
    if (!u) {
      return res.status(401).json({ error: { code: 'INVALID_CREDENTIALS', message: 'Credenciais inválidas' } });
    }

    const ok = await bcrypt.compare(password, u.password);
    if (!ok) {
      return res.status(401).json({ error: { code: 'INVALID_CREDENTIALS', message: 'Credenciais inválidas' } });
    }

    const user = { id: u.id, username: u.username, userType: u.userType, createdAt: u.createdAt };
    const token = signToken({ id: u.id, userType: u.userType });
    
    await logsService.log('INFO', 'USER_LOGIN', { userId: u.id });
    
    res.json({ user, token });
  } catch (err: any) {
    if (err instanceof ZodError) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: err.issues.map(i => i.message).join(', ') }
      });
    }
    res.status(500).json({ error: { code: 'LOGIN_FAILED', message: 'Falha ao autenticar' } });
  }
});

// ===================== GAMES =====================
app.get('/games', async (req, res) => {
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

    const [total, games] = await Promise.all([
      prisma.game.count({ where }),
      prisma.game.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { 
          images: { orderBy: { orderIndex: 'asc' } },
          developer: { select: { username: true } }
        },
      }),
    ]);

    const gamesWithUrls = games.map(g => ({
      ...g,
      fileUrl: g.s3Key ? getS3Url(g.s3Key) : null,
      images: g.images.map(img => ({
        ...img,
        url: getS3Url(img.s3Key),
      })),
    }));

    res.json({ items: gamesWithUrls, page, pageSize, total });
  } catch (err: any) {
    await logsService.log('ERROR', 'LIST_GAMES_FAILED', { error: err.message });
    res.status(500).json({ error: { code: 'LIST_GAMES_FAILED', message: 'Falha ao listar games' } });
  }
});

app.get('/games/:id', async (req, res) => {
  try {
    const id = String(req.params.id);
    const game = await prisma.game.findUnique({
      where: { id },
      include: { 
        images: { orderBy: { orderIndex: 'asc' } },
        developer: { select: { id: true, username: true } }
      },
    });
    
    if (!game) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Game não encontrado' } });
    }

    const gameWithUrls = {
      ...game,
      fileUrl: game.s3Key ? getS3Url(game.s3Key) : null,
      images: game.images.map(img => ({
        ...img,
        url: getS3Url(img.s3Key),
      })),
    };

    res.json(gameWithUrls);
  } catch (err: any) {
    await logsService.log('ERROR', 'GET_GAME_FAILED', { gameId: req.params.id, error: err.message });
    res.status(500).json({ error: { code: 'GET_GAME_FAILED', message: 'Falha ao obter game' } });
  }
});

app.get('/dev/my-games', auth({ roles: [UserType.DEV] }), async (req: any, res) => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10));
    const pageSize = Math.min(50, Math.max(1, parseInt(String(req.query.pageSize || '12'), 10)));

    const [total, items] = await Promise.all([
      prisma.game.count({ where: { developerId: req.user.id } }),
      prisma.game.findMany({
        where: { developerId: req.user.id },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { images: { orderBy: { orderIndex: 'asc' } } },
      }),
    ]);

    const gamesWithUrls = items.map(g => ({
      ...g,
      fileUrl: g.s3Key ? getS3Url(g.s3Key) : null,
      images: g.images.map(img => ({
        ...img,
        url: getS3Url(img.s3Key),
      })),
    }));

    res.json({ items: gamesWithUrls, page, pageSize, total });
  } catch (err: any) {
    await logsService.log('ERROR', 'LIST_DEV_GAMES_FAILED', { userId: req.user?.id, error: err.message });
    res.status(500).json({ error: { code: 'LIST_DEV_GAMES_FAILED', message: 'Falha ao listar games do DEV' } });
  }
});

const CreateGameFields = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  genre: z.string().min(1),
});

app.post(
  '/games',
  auth({ roles: [UserType.DEV] }),
  upload.fields([
    { name: 'images', maxCount: 3 },
    { name: 'file', maxCount: 1 },
  ]),
  async (req: any, res) => {
    try {
      const { title, description, genre } = CreateGameFields.parse(req.body || {});
      const images = (req.files?.images as Express.Multer.File[] | undefined) || [];
      const file = (req.files?.file as Express.Multer.File[] | undefined)?.[0];

      // Upload images to S3
      const imagesData = await Promise.all(
        images.slice(0, 3).map(async (f, idx) => ({
          s3Key: await uploadToS3(f, 'game-images'),
          orderIndex: idx,
        }))
      );

      // Upload game file to S3
      const s3Key = file ? await uploadToS3(file, 'game-files') : null;

      const game = await prisma.game.create({
        data: {
          title,
          description,
          genre,
          developerId: req.user.id,
          likes: 0,
          dislikes: 0,
          ...(s3Key ? { s3Key } : {}),
          ...(imagesData.length ? { images: { create: imagesData } } : {}),
        },
        include: { images: { orderBy: { orderIndex: 'asc' } } },
      });

      await logsService.log('INFO', 'GAME_CREATED', { userId: req.user.id, gameId: game.id });
      
      // Send to SQS for async processing
      await sendToQueue({
        action: 'GAME_CREATED',
        gameId: game.id,
        title: game.title,
      });

      // Notify via SNS
      await publishNotification(
        `Novo jogo publicado: ${game.title} por ${req.user.id}`,
        'Novo Jogo Publicado'
      );

      const gameWithUrls = {
        ...game,
        fileUrl: game.s3Key ? getS3Url(game.s3Key) : null,
        images: game.images.map(img => ({
          ...img,
          url: getS3Url(img.s3Key),
        })),
      };

      res.status(201).json(gameWithUrls);
    } catch (err: any) {
      if (err instanceof ZodError) {
        return res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: err.issues.map(i => i.message).join(', ') }
        });
      }
      await logsService.log('ERROR', 'CREATE_GAME_FAILED', { userId: req.user?.id, error: err.message });
      res.status(500).json({ error: { code: 'CREATE_GAME_FAILED', message: 'Falha ao criar game' } });
    }
  }
);

// ===================== RATINGS (DynamoDB) =====================
app.post('/games/:id/like', auth(), async (req: any, res) => {
  try {
    const gameId = String(req.params.id);
    
    const existing = await ratingsService.getRating(req.user.id, gameId);
    const oldType = existing?.type;
    
    await ratingsService.setRating(req.user.id, gameId, RatingType.LIKE);
    
    // Update counters in RDS
    if (!existing) {
      await prisma.game.update({ where: { id: gameId }, data: { likes: { increment: 1 } } });
    } else if (oldType === RatingType.DISLIKE) {
      await prisma.game.update({ 
        where: { id: gameId }, 
        data: { likes: { increment: 1 }, dislikes: { decrement: 1 } } 
      });
    }
    
    const game = await prisma.game.findUnique({ 
      where: { id: gameId }, 
      select: { likes: true, dislikes: true } 
    });
    
    await logsService.log('INFO', 'GAME_LIKED', { userId: req.user.id, gameId });
    
    res.json({ likes: game?.likes ?? 0, dislikes: game?.dislikes ?? 0, userRating: 'LIKE' });
  } catch (err: any) {
    await logsService.log('ERROR', 'LIKE_FAILED', { userId: req.user?.id, gameId: req.params.id, error: err.message });
    res.status(500).json({ error: { code: 'LIKE_FAILED', message: 'Falha ao curtir' } });
  }
});

app.post('/games/:id/dislike', auth(), async (req: any, res) => {
  try {
    const gameId = String(req.params.id);
    
    const existing = await ratingsService.getRating(req.user.id, gameId);
    const oldType = existing?.type;
    
    await ratingsService.setRating(req.user.id, gameId, RatingType.DISLIKE);
    
    if (!existing) {
      await prisma.game.update({ where: { id: gameId }, data: { dislikes: { increment: 1 } } });
    } else if (oldType === RatingType.LIKE) {
      await prisma.game.update({ 
        where: { id: gameId }, 
        data: { dislikes: { increment: 1 }, likes: { decrement: 1 } } 
      });
    }
    
    const game = await prisma.game.findUnique({ 
      where: { id: gameId }, 
      select: { likes: true, dislikes: true } 
    });
    
    await logsService.log('INFO', 'GAME_DISLIKED', { userId: req.user.id, gameId });
    
    res.json({ likes: game?.likes ?? 0, dislikes: game?.dislikes ?? 0, userRating: 'DISLIKE' });
  } catch (err: any) {
    await logsService.log('ERROR', 'DISLIKE_FAILED', { userId: req.user?.id, gameId: req.params.id, error: err.message });
    res.status(500).json({ error: { code: 'DISLIKE_FAILED', message: 'Falha ao descurtir' } });
  }
});

app.delete('/games/:id/rating', auth(), async (req: any, res) => {
  try {
    const gameId = String(req.params.id);
    const existing = await ratingsService.getRating(req.user.id, gameId);
    
    if (existing) {
      await ratingsService.deleteRating(req.user.id, gameId);
      
      if (existing.type === RatingType.LIKE) {
        await prisma.game.update({ where: { id: gameId }, data: { likes: { decrement: 1 } } });
      } else {
        await prisma.game.update({ where: { id: gameId }, data: { dislikes: { decrement: 1 } } });
      }
    }
    
    const game = await prisma.game.findUnique({ 
      where: { id: gameId }, 
      select: { likes: true, dislikes: true } 
    });
    
    await logsService.log('INFO', 'RATING_REMOVED', { userId: req.user.id, gameId });
    
    res.json({ likes: game?.likes ?? 0, dislikes: game?.dislikes ?? 0, userRating: null });
  } catch (err: any) {
    await logsService.log('ERROR', 'RATING_RESET_FAILED', { userId: req.user?.id, gameId: req.params.id, error: err.message });
    res.status(500).json({ error: { code: 'RATING_RESET_FAILED', message: 'Falha ao remover avaliação' } });
  }
});

app.get('/games/:id/rating', auth(), async (req: any, res) => {
  try {
    const gameId = String(req.params.id);
    const rating = await ratingsService.getRating(req.user.id, gameId);
    res.json({ userRating: rating?.type || null });
  } catch (err: any) {
    res.status(500).json({ error: { code: 'GET_RATING_FAILED', message: 'Falha ao obter rating' } });
  }
});

// ===================== REVIEWS (DynamoDB) =====================
app.get('/games/:id/reviews', async (req, res) => {
  try {
    const gameId = String(req.params.id);
    const page = Number(req.query.page ?? 1);
    const pageSize = Number(req.query.pageSize ?? 20);

    const result = await reviewsService.getGameReviews(gameId, pageSize);
    
    res.json({ 
      items: result.items.map(r => ({
        id: r.reviewId,
        gameId: r.gameId,
        userId: r.userId,
        comment: r.comment,
        createdAt: r.createdAt,
        author: { username: r.username }
      })),
      total: result.items.length,
      page,
      pageSize 
    });
  } catch (err: any) {
    await logsService.log('ERROR', 'LIST_REVIEWS_FAILED', { gameId: req.params.id, error: err.message });
    res.status(500).json({ error: { code: 'LIST_REVIEWS_FAILED', message: 'Falha ao listar comentários' } });
  }
});

const CreateReviewSchema = z.object({ comment: z.string().min(1).max(500) });

app.post('/games/:id/reviews', auth(), async (req: any, res) => {
  try {
    const gameId = String(req.params.id);
    const { comment } = CreateReviewSchema.parse(req.body);
    
    const user = await prisma.user.findUnique({ 
      where: { id: req.user.id },
      select: { username: true }
    });
    
    if (!user) {
      return res.status(404).json({ error: { code: 'USER_NOT_FOUND', message: 'Usuário não encontrado' } });
    }

    const review = await reviewsService.createReview(gameId, req.user.id, user.username, comment);
    
    await logsService.log('INFO', 'REVIEW_CREATED', { userId: req.user.id, gameId });
    
    return res.status(201).json({
      id: review.reviewId,
      gameId: review.gameId,
      userId: review.userId,
      comment: review.comment,
      createdAt: review.createdAt,
      author: { username: review.username }
    });
  } catch (err: any) {
    if (err instanceof ZodError) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: err.issues.map(i => i.message).join(', ') }
      });
    }
    await logsService.log('ERROR', 'CREATE_REVIEW_FAILED', { userId: req.user?.id, gameId: req.params.id, error: err.message });
    return res.status(500).json({ error: { code: 'CREATE_REVIEW_FAILED', message: 'Falha ao criar comentário' } });
  }
});

// ===================== DOWNLOADS =====================
const AddDownloadSchema = z.object({ gameId: z.string().min(1) });

app.post('/downloads', auth(), async (req: any, res) => {
  try {
    const { gameId } = AddDownloadSchema.parse(req.body);
    
    const existing = await prisma.download.findFirst({
      where: { userId: req.user.id, gameId }
    });
    
    if (existing) {
      return res.status(409).json({ error: { code: 'ALREADY_IN_LIBRARY', message: 'Jogo já está na biblioteca' } });
    }
    
    const dl = await prisma.download.create({
      data: { userId: req.user.id, gameId, downloadDate: new Date() },
      select: { id: true, gameId: true, userId: true, downloadDate: true },
    });
    
    await logsService.log('INFO', 'GAME_ADDED_TO_LIBRARY', { userId: req.user.id, gameId });
    
    res.status(201).json(dl);
  } catch (err: any) {
    if (err instanceof ZodError) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: err.issues.map(i => i.message).join(', ') }
      });
    }
    await logsService.log('ERROR', 'ADD_DOWNLOAD_FAILED', { userId: req.user?.id, error: err.message });
    res.status(500).json({ error: { code: 'ADD_DOWNLOAD_FAILED', message: 'Falha ao salvar na biblioteca' } });
  }
});

app.get('/downloads', auth(), async (req: any, res) => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10));
    const pageSize = Math.min(50, Math.max(1, parseInt(String(req.query.pageSize || '12'), 10)));
    
    const [total, items] = await Promise.all([
      prisma.download.count({ where: { userId: req.user.id } }),
      prisma.download.findMany({
        where: { userId: req.user.id },
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
    
    const downloadsWithUrls = items.map(d => ({
      ...d,
      game: {
        ...d.game,
        fileUrl: d.game.s3Key ? getS3Url(d.game.s3Key) : null,
        images: d.game.images.map(img => ({
          ...img,
          url: getS3Url(img.s3Key),
        })),
      },
    }));
    
    res.json({ items: downloadsWithUrls, total, page, pageSize });
  } catch (err: any) {
    await logsService.log('ERROR', 'LIST_DOWNLOADS_FAILED', { userId: req.user?.id, error: err.message });
    res.status(500).json({ error: { code: 'LIST_DOWNLOADS_FAILED', message: 'Falha ao listar biblioteca' } });
  }
});

app.delete('/downloads/:id', auth(), async (req: any, res) => {
  try {
    const id = String(req.params.id);
    await prisma.download.deleteMany({ where: { id, userId: req.user.id } });
    
    await logsService.log('INFO', 'GAME_REMOVED_FROM_LIBRARY', { userId: req.user.id, downloadId: id });
    
    res.status(204).send();
  } catch (err: any) {
    await logsService.log('ERROR', 'DELETE_DOWNLOAD_FAILED', { userId: req.user?.id, downloadId: req.params.id, error: err.message });
    res.status(500).json({ error: { code: 'DELETE_DOWNLOAD_FAILED', message: 'Falha ao remover da biblioteca' } });
  }
});

// ===================== 404 =====================
app.use((_req, res) => {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Rota não encontrada' } });
});

// ===================== START =====================
app.listen(PORT, () => {
  console.log(`API up on http://localhost:${PORT}`);
});