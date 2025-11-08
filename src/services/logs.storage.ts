// src/services/logs.storage.ts
import { ddb, ddbTable } from '../config/aws';
// 👇 1. Importar o 'PutCommand' do SDK v3
import { PutCommand } from '@aws-sdk/lib-dynamodb';

export type CrudAction = 'UPLOAD' | 'CREATE' | 'READ' | 'UPDATE' | 'DELETE';

export async function logCrud(action: CrudAction, data: unknown) {
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