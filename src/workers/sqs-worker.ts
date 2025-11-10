/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
// src/workers/sqs-worker.ts
import 'dotenv/config';
import { sqs, s3, ddb, sqsQueueUrl, s3Bucket, ddbTable } from '../config/aws';
import { ratingsService, reviewsService } from '../services/dynamodb.services';
import {
  ReceiveMessageCommand,
  DeleteMessageCommand,
  Message,
} from '@aws-sdk/client-sqs';
import { GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { PutCommand } from '@aws-sdk/lib-dynamodb';

import { resizeAndSaveImage } from '../processors/image-processor';

interface SQSMessage {
  eventType: string;
  s3Key?: string;
  fileName?: string;
  data?: {
    gameId?: string;
    title?: string;
    [key: string]: any;
  };
}

async function processMessage(message: Message): Promise<void> {
  try {
    const body = JSON.parse(message.Body || '{}');
    const payload: SQSMessage = body.Message ? JSON.parse(body.Message) : body;

    console.log('[Worker] Processando mensagem:', payload.eventType);

    switch (payload.eventType) {
      case 'FILE_UPLOADED':
        await handleFileUploaded(payload);
        break;

      case 'GAME_CREATED':
        await handleGameCreated(payload);
        break;

      default:
        console.log('[Worker] Tipo de evento desconhecido:', payload.eventType);
    }

    await ddb.send(
      new PutCommand({
        TableName: ddbTable, 
        Item: {
          operation_id: Date.now().toString(), 
          action: 'PROCESS_FILE',
          data: { 
            eventType: payload.eventType, 
            s3Key: payload.s3Key,
            processed: true 
          },
          timestamp: new Date().toISOString(),
        },
      }),
    );
  } catch (error) {
    console.error('[Worker] Erro ao processar mensagem:', error);
    throw error; 
  }
}

async function handleFileUploaded(payload: SQSMessage): Promise<void> {
  const { s3Key, fileName } = payload;
  if (!s3Key) {
    console.error('[Worker] Mensagem FILE_UPLOADED sem s3Key.');
    return;
  }
  
  if (!s3Key.startsWith('game-images/')) {
    console.log(`[Worker] Pulando processamento (não é imagem): ${s3Key}`);
    return;
  }

  console.log(`[Worker] Processando imagem: ${fileName} (${s3Key})`);

  try {
    console.log(`[Worker] Baixando...`);
    const s3Object = await s3.send(
      new GetObjectCommand({
        Bucket: s3Bucket,
        Key: s3Key,
      }),
    );
    if (!s3Object.Body) throw new Error('S3 object body is empty');
    
    // Buffer
    const buffer = Buffer.from(await s3Object.Body.transformToByteArray());

    // Chamar processor
    console.log(`[Worker] Redimensionando...`);
    const resizedKey = await resizeAndSaveImage(s3Key, buffer, '_resized');

    // 3. (Opcional) Deletar o arquivo original
    // await s3.send(new DeleteObjectCommand({ Bucket: s3Bucket, Key: s3Key }));

    console.log(`[Worker] Imagem redimensionada salva como: ${resizedKey}`);

  } catch (error: any) {
    console.error(`[Worker] Erro ao processar arquivo ${s3Key}:`, error.message);
    throw error; 
  }
}

async function handleGameCreated(payload: SQSMessage): Promise<void> {
  const { data } = payload;
  console.log(`[Worker] Novo jogo criado (apenas notificação): ${data?.gameId} - ${data?.title}`);
}

async function handleGameDeleted(payload: SQSMessage): Promise<void> {
  const gameId = payload.data?.gameId;
  if (!gameId) {
    console.error('[Worker] Mensagem GAME_DELETED sem gameId.');
    return;
  }

  console.log(`[Worker] Limpando dados do DynamoDB para o Jogo ID: ${gameId}...`);
  
  try {
    const [ratingsCount, reviewsCount] = await Promise.all([
      ratingsService.deleteAllRatingsForGame(gameId),
      reviewsService.deleteAllReviewsForGame(gameId),
    ]);
    console.log(`[Worker] Limpeza concluída. ${ratingsCount} ratings e ${reviewsCount} reviews apagados.`);
  } catch (error: any) {
    console.error(`[Worker] Erro ao limpar dados do DynamoDB para o jogo ${gameId}:`, error.message);
    throw error; 
  }
}

async function processMessages(): Promise<void> {
  if (!sqsQueueUrl) {
    console.error('[Worker] SQS_QUEUE_URL não configurado. Worker não pode iniciar.');
    return;
  }

  try {
    const data = await sqs.send(
      new ReceiveMessageCommand({
        QueueUrl: sqsQueueUrl,
        MaxNumberOfMessages: 10,
        WaitTimeSeconds: 10,
        VisibilityTimeout: 300, 
      }),
    );

    if (!data.Messages || data.Messages.length === 0) {
      return;
    }
    console.log(`[Worker] Recebidas ${data.Messages.length} mensagens`);

    for (const message of data.Messages) {
      try {
        await processMessage(message);

        await sqs.send(
          new DeleteMessageCommand({
            QueueUrl: sqsQueueUrl,
            ReceiptHandle: message.ReceiptHandle!,
          }),
        );
        console.log('[Worker] Mensagem processada e deletada.');
      } catch (error) {
        console.error('[Worker] Falha ao processar mensagem (retornando para a fila):', error);
      }
    }
  } catch (error) {
    console.error('[Worker] Erro ao receber mensagens:', error);
  }
}

// Polling loop
const POLL_INTERVAL = 5000; 

async function startWorker() {
  console.log(' SQS Worker iniciado');
  console.log(`Polling queue: ${sqsQueueUrl}`);

  while (true) {
    await processMessages();
    await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
  }
}


// Start
startWorker().catch(error => {
  console.error('[Worker]  FATAL: Worker crashou:', error);
  process.exit(1);
});