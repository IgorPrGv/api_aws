// src/services/logs.storage.ts
import { ddb, ddbTable } from '../config/aws';
import { PutCommand } from '@aws-sdk/lib-dynamodb';

export type CrudAction = 'UPLOAD' | 'CREATE' | 'READ' | 'UPDATE' | 'DELETE';

export async function logCrud(action: CrudAction, data: unknown) {

  if (process.env.NODE_ENV === "development" || !process.env.AWS_ACCESS_KEY_ID) {
    console.log("[DEV logCrud]", action, data);
    return;
  }

  const item = {
    log_id: Date.now().toString(),
    action,
    data,
    timestamp: new Date().toISOString(),
  };

  await ddb.send(
    new PutCommand({
      TableName: ddbTable,
      Item: item,
    }),
  );

  return item.log_id;
}