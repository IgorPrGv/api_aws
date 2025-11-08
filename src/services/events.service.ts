/* eslint-disable @typescript-eslint/no-explicit-any */
// src/services/events.service.ts
import { sns, snsTopic } from '../config/aws';
import { PublishCommand } from '@aws-sdk/client-sns';

export async function publishUploadEvent(fileName: string, s3Key: string) {
  if (process.env.NODE_ENV !== 'production') {
    console.log(`[SNS_BYPASS] Evento: FILE_UPLOADED`, { s3Key, fileName });
    return;
  }

  if (!snsTopic) {
    console.warn('SNS Topic not configured, skipping event publish');
    return;
  }

  const message = JSON.stringify({
    eventType: 'FILE_UPLOADED',
    fileName,
    s3Key,
    timestamp: new Date().toISOString(),
  });

  try {
    await sns.send(
      new PublishCommand({
        TopicArn: snsTopic,
        Message: message,
        Subject: 'File Uploaded',
      }),
    );
  } catch (error) {
    console.error('Error publishing upload event:', error);
  }
}

export async function publishGameEvent(eventType: string, data: any) {

  if (process.env.NODE_ENV !== 'production') {
    console.log(`[SNS_BYPASS] Evento: ${eventType}`, data);
    return;
  }

  if (!snsTopic) {
    console.warn('SNS Topic not configured, skipping event publish');
    return;
  }

  const message = JSON.stringify({
    eventType,
    data,
    timestamp: new Date().toISOString(),
  });

  try {
    await sns.send(
      new PublishCommand({
        TopicArn: snsTopic,
        Message: message,
        Subject: `Game Event: ${eventType}`,
      }),
    );
  } catch (error) {
    console.error('Error publishing game event:', error);
  }
}

export async function publishNotification(subject: string, message: string) {

  if (process.env.NODE_ENV !== 'production') {
    console.log(`[SNS_BYPASS] Notificação: ${subject}`);
    return;
  }

  if (!snsTopic) {
    console.warn('SNS Topic not configured, skipping notification');
    return;
  }

  try {
    // 👇 4. Usar a sintaxe v3
    await sns.send(
      new PublishCommand({
        TopicArn: snsTopic,
        Message: message,
        Subject: subject,
      }),
    );
  } catch (error) {
    console.error('Error publishing notification:', error);
  }
}