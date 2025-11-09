import sharp from 'sharp';
import { s3, s3Bucket } from '../config/aws';
import { PutObjectCommand } from '@aws-sdk/client-s3';

export async function resizeAndSaveImage(
  originalKey: string,
  buffer: Buffer,
  suffix = '_resized',
) {
  const resized = await sharp(buffer).resize(800).toBuffer();
  const resizedKey = originalKey.replace(
    /(\.[^.]+)$/,
    `${suffix}$1`,
  );
  await s3.send(
    new PutObjectCommand({
      Bucket: s3Bucket,
      Key: resizedKey,
      Body: resized,
      ContentType: 'image/jpeg', // ajuste se necessário
    }),
  );

  return resizedKey;
}