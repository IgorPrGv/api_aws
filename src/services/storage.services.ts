// src/services/storage.service.ts
import { s3, s3Bucket } from '../config/aws';
import {
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

type UploadParams = {
  key: string;
  contentType: string;
  body: Buffer;
};

export async function uploadBufferToS3({ key, contentType, body }: UploadParams) {

  if (process.env.NODE_ENV !== 'production') {
    console.log(`[S3_BYPASS] Upload simulado para a chave: ${key}`);
    return { key, location: `s3://${s3Bucket}/${key}` };
  }

  await s3.send(
    new PutObjectCommand({
      Bucket: s3Bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
      ACL: 'public-read',
    }),
  );

  return { key, location: `s3://${s3Bucket}/${key}` };
}

export async function deleteFromS3(key: string): Promise<void> {

  if (process.env.NODE_ENV !== 'production') {
    console.log(`[S3_BYPASS] Delete simulado da chave: ${key}`);
    return;
  }
  
  await s3.send(
    new DeleteObjectCommand({
      Bucket: s3Bucket,
      Key: key,
    }),
  );
}

export function getS3PublicUrl(key: string): string {
  return `https://${s3Bucket}.s3.${
    process.env.AWS_REGION || 'us-east-1'
  }.amazonaws.com/${key}`;
}

export async function getS3SignedUrl(
  key: string,
  expiresIn: number = 3600,
): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: s3Bucket,
    Key: key,
  });

  return getSignedUrl(s3, command, { expiresIn });
}

export async function uploadMultipleToS3(
  files: Array<{ buffer: Buffer; mimetype: string; originalname: string }>,
  folder: string,
): Promise<string[]> {

  const uploadPromises = files.map(async file => {
    const ext = file.originalname.includes('.')
      ? file.originalname.split('.').pop()
      : 'bin';

    const key = `${folder}/${Date.now()}-${Math.random()
      .toString(36)
      .substr(2, 9)}.${ext}`;

    await uploadBufferToS3({
      key,
      contentType: file.mimetype,
      body: file.buffer,
    });

    return key;
  });

  return Promise.all(uploadPromises);
}