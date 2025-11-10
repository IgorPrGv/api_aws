/* eslint-disable @typescript-eslint/no-explicit-any */
// src/services/events.service.ts
import { sns, snsTopic } from '../config/aws';
import { PublishCommand } from '@aws-sdk/client-sns';

/**
 * Publica um evento JSON padronizado para o tópico SNS.
 * O worker (SQS) irá receber esta mensagem.
 * @param eventType 
 * @param data 
 */
export async function publishEvent(eventType: string, data: any) {
  if (process.env.NODE_ENV !== 'production') {
    console.log(`[SNS_BYPASS] Evento: ${eventType}`, data);
    return;
  }

  if (!snsTopic) {
    console.warn('SNS Topic not configured, skipping event publish');
    return;
  }

  // Criar a mensagem JSON padronizada
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
    console.error('Error publishing event:', error);
  }
}