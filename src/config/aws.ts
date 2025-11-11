// src/config/aws.ts
import { S3Client } from '@aws-sdk/client-s3';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { SNSClient } from '@aws-sdk/client-sns';
import { SQSClient } from '@aws-sdk/client-sqs';

// --- Configuração Base ---
const region = process.env.AWS_REGION || 'us-east-1';

const clientConfig = { region };

// ===================== S3 =====================
export const s3 = new S3Client(clientConfig);
export const s3Bucket = process.env.AWS_S3_BUCKET || '';

if (!s3Bucket) {
  console.warn('⚠️  AWS_S3_BUCKET não configurado');
}

// ===================== DynamoDB =====================
const ddbBaseClient = new DynamoDBClient(clientConfig);

// Opções para facilitar a tradução de JSON para o formato DynamoDB
const marshallOptions = {
  removeUndefinedValues: true, 
  convertEmptyValues: true, 
};

export const ddb = DynamoDBDocumentClient.from(ddbBaseClient, {
  marshallOptions,
});

// Tables
export const ddbTable = process.env.DDB_TABLE_CRUD || 'crud_logs';
export const ddbTableRatings = process.env.DDB_TABLE_RATINGS || 'GameRatings';
export const ddbTableReviews = process.env.DDB_TABLE_REVIEWS || 'GameReviews';

if (!ddbTable) {
  console.warn(' [AWS] DDB_TABLE_CRUD não configurado');
}

// ===================== SNS =====================
export const sns = new SNSClient(clientConfig);
export const snsTopic = process.env.SNS_TOPIC_ARN || '';

if (!snsTopic) {
  console.warn('[AWS] SNS_TOPIC_ARN não configurado');
}

// ===================== SQS =====================
export const sqs = new SQSClient(clientConfig);
export const sqsQueueUrl = process.env.SQS_QUEUE_URL || '';

if (!sqsQueueUrl) {
  console.warn('⚠️  SQS_QUEUE_URL não configurado');
}

// Log de inicialização
console.log('[AWS] Services configurados (v3):', {
  region: region,
  s3Bucket,
  ddbTable,
  ddbTableRatings,
  ddbTableReviews,
  hasSNS: !!snsTopic,
  hasSQS: !!sqsQueueUrl,
});