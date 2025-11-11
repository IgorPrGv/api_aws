import sharp from 'sharp';
import { s3, s3Bucket } from '../config/aws';
import { PutObjectCommand } from '@aws-sdk/client-s3';

export async function resizeAndSaveImage(
  originalKey: string,
  buffer: Buffer,
) {
  const resized = await sharp(buffer).resize(800).toBuffer();

  await s3.send(
    new PutObjectCommand({
      Bucket: s3Bucket,
      Key: originalKey, 
      Body: resized,
      ContentType: 'image/jpeg',
      Metadata: {
        'resized': 'true'
      },
      ACL: 'public-read'
    }),
  );

  return originalKey;
}