/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
// src/workers/sqs-worker.ts
import 'dotenv/config';
import { sqs, s3, ddb, sqsQueueUrl, s3Bucket, ddbTable } from '../config/aws';

// 👇 1. Importar os comandos do SDK v3
import {
  ReceiveMessageCommand,
  DeleteMessageCommand,
  Message, // <-- O novo tipo para a mensagem SQS
} from '@aws-sdk/client-sqs';
import { HeadObjectCommand } from '@aws-sdk/client-s3';
import { PutCommand } from '@aws-sdk/lib-dynamodb';

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

// 👇 2. Trocar o tipo de 'AWS.SQS.Message' para 'Message'
async function processMessage(message: Message): Promise<void> {
  try {
    // Parse message body (a v3 ainda usa 'message.Body')
    const body = JSON.parse(message.Body || '{}');

    // Se vier do SNS, precisa fazer outro parse
    const payload: SQSMessage = body.Message ? JSON.parse(body.Message) : body;

    console.log('Processing message:', payload.eventType);

    switch (payload.eventType) {
      case 'FILE_UPLOADED':
        await handleFileUploaded(payload);
        break;

      case 'GAME_CREATED':
        await handleGameCreated(payload);
        break;

      default:
        console.log('Unknown event type:', payload.eventType);
    }

    // 👇 3. Usar a sintaxe v3 do DynamoDB
    await ddb.send(
      new PutCommand({
        TableName: ddbTable,
        Item: {
          log_id: Date.now().toString(),
          action: 'PROCESS',
          data: { eventType: payload.eventType, processed: true },
          timestamp: new Date().toISOString(),
        },
      }),
    );
  } catch (error) {
    console.error('Error processing message:', error);
    throw error; // Re-throw para que a mensagem volte para a fila
  }
}

async function handleFileUploaded(payload: SQSMessage): Promise<void> {
  const { s3Key, fileName } = payload;

  if (!s3Key) return;

  console.log(`Processing file: ${fileName} (${s3Key})`);
  // ... (lógica de processamento) ...

  // Exemplo: verificar se arquivo existe
  try {
    // 👇 4. Usar a sintaxe v3 do S3
    await s3.send(
      new HeadObjectCommand({
        Bucket: s3Bucket,
        Key: s3Key,
      }),
    );

    console.log(`File ${s3Key} exists in S3`);
  } catch (error) {
    console.error(`File ${s3Key} not found in S3`);
  }
}

async function handleGameCreated(payload: SQSMessage): Promise<void> {
  const { data } = payload;

  console.log(`New game created: ${data?.gameId} - ${data?.title}`);
  // ... (lógica de notificação) ...
}

async function processMessages(): Promise<void> {
  if (!sqsQueueUrl) {
    console.error('SQS_QUEUE_URL not configured');
    return;
  }

  try {
    // 👇 5. Usar a sintaxe v3 do SQS (ReceiveMessage)
    const data = await sqs.send(
      new ReceiveMessageCommand({
        QueueUrl: sqsQueueUrl,
        MaxNumberOfMessages: 10,
        WaitTimeSeconds: 10,
        VisibilityTimeout: 300, // 5 minutos
      }),
    );

    if (!data.Messages || data.Messages.length === 0) {
      return;
    }

    console.log(`Received ${data.Messages.length} messages`);

    for (const message of data.Messages) {
      try {
        await processMessage(message);

        // 👇 6. Usar a sintaxe v3 do SQS (DeleteMessage)
        // (a v3 ainda usa 'message.ReceiptHandle')
        await sqs.send(
          new DeleteMessageCommand({
            QueueUrl: sqsQueueUrl,
            ReceiptHandle: message.ReceiptHandle!,
          }),
        );

        console.log('Message processed and deleted');
      } catch (error) {
        console.error('Failed to process message:', error);
        // Mensagem voltará para a fila após VisibilityTimeout
      }
    }
  } catch (error) {
    console.error('Error receiving messages:', error);
  }
}

// Polling loop
const POLL_INTERVAL = 5000; // 5 segundos

async function startWorker() {
  console.log('🚀 SQS Worker started');
  console.log(`Polling queue: ${sqsQueueUrl}`);

  while (true) {
    await processMessages();
    await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
  }
}

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('Shutting down worker...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('Shutting down worker...');
  process.exit(0);
});

// Start
startWorker().catch(error => {
  console.error('Worker crashed:', error);
  process.exit(1);
});