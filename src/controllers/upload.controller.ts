// src/services/upload.service.ts
import crypto from 'crypto';
import { uploadBufferToS3 } from '../services/storage.services';
import { publishEvent } from '../services/events.service';
import { logsService } from '../services/dynamodb.services';

/**
 * Faz upload de UM arquivo para o S3, dispara o evento SNS e loga no DynamoDB.
 */
export async function uploadAndProcessFile(
  file: Express.Multer.File,
  folder: string,
): Promise<string> {
  const fileName = file.originalname;
  const ext = fileName.includes('.') ? fileName.split('.').pop() : 'bin';
  const key = `${folder}/${Date.now()}-${crypto.randomUUID()}.${ext}`;

  console.log(`[UploadService] Enviando '${fileName}' para S3 (Chave: ${key})`);
  await uploadBufferToS3({
    key,
    contentType: file.mimetype,
    body: file.buffer,
  });

  // Só dispara o evento de redimensionamento se for uma imagem
  if (folder === 'game-images') {
    console.log(`[UploadService] Publicando evento FILE_UPLOADED (SNS) para: ${key}`);
    await publishEvent('FILE_UPLOADED', { s3Key: key, fileName });
  }

  await logsService.log('FILE_UPLOADED', { key, fileName, size: file.size });

  return key;
}
