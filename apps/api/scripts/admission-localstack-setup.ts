import {
  CreateEventSourceMappingCommand,
  CreateFunctionCommand,
  GetFunctionCommand,
  LambdaClient,
  ListEventSourceMappingsCommand,
  ResourceConflictException,
  UpdateEventSourceMappingCommand,
  UpdateFunctionCodeCommand,
  UpdateFunctionConfigurationCommand,
} from '@aws-sdk/client-lambda';
import {
  CreateQueueCommand,
  GetQueueAttributesCommand,
  GetQueueUrlCommand,
  SQSClient,
} from '@aws-sdk/client-sqs';

const endpoint = process.env.ADMISSION_SQS_ENDPOINT ?? 'http://localhost:4566';
const region = process.env.AWS_REGION ?? 'ap-southeast-1';
const queueName = process.env.ADMISSION_SQS_QUEUE_NAME ?? 'shopee-flash-sale-admission';
const functionName = process.env.ADMISSION_LAMBDA_FUNCTION_NAME ?? 'shopee-flash-sale-admission';
const grantUrl =
  process.env.ADMISSION_LAMBDA_GRANT_URL ??
  'http://host.docker.internal:3001/api/v1/internal/admission/queue/grant';
const sharedSecret = process.env.ADMISSION_LAMBDA_SHARED_SECRET?.trim() ?? '';
const deployLambda = process.env.ADMISSION_LAMBDA_DEPLOY !== 'false';
const credentials = {
  accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? 'test',
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? 'test',
};
const clientOptions = { region, endpoint, credentials };
const sqs = new SQSClient(clientOptions);

function crc32(input: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of input) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** Creates a minimal, dependency-free ZIP containing the Lambda handler. */
function zipSingleFile(name: string, source: string): Buffer {
  const filename = Buffer.from(name, 'utf8');
  const content = Buffer.from(source, 'utf8');
  const crc = crc32(content);
  const local = Buffer.alloc(30 + filename.length + content.length);
  let offset = 0;
  local.writeUInt32LE(0x04034b50, offset);
  offset += 4;
  local.writeUInt16LE(20, offset);
  offset += 2;
  local.writeUInt16LE(0, offset);
  offset += 2;
  local.writeUInt16LE(0, offset);
  offset += 2;
  local.writeUInt16LE(0, offset);
  offset += 2;
  local.writeUInt16LE(0, offset);
  offset += 2;
  local.writeUInt32LE(crc, offset);
  offset += 4;
  local.writeUInt32LE(content.length, offset);
  offset += 4;
  local.writeUInt32LE(content.length, offset);
  offset += 4;
  local.writeUInt16LE(filename.length, offset);
  offset += 2;
  local.writeUInt16LE(0, offset);
  offset += 2;
  filename.copy(local, offset);
  offset += filename.length;
  content.copy(local, offset);

  const central = Buffer.alloc(46 + filename.length);
  offset = 0;
  central.writeUInt32LE(0x02014b50, offset);
  offset += 4;
  central.writeUInt16LE(20, offset);
  offset += 2;
  central.writeUInt16LE(20, offset);
  offset += 2;
  central.writeUInt16LE(0, offset);
  offset += 2;
  central.writeUInt16LE(0, offset);
  offset += 2;
  central.writeUInt16LE(0, offset);
  offset += 2;
  central.writeUInt16LE(0, offset);
  offset += 2;
  central.writeUInt32LE(crc, offset);
  offset += 4;
  central.writeUInt32LE(content.length, offset);
  offset += 4;
  central.writeUInt32LE(content.length, offset);
  offset += 4;
  central.writeUInt16LE(filename.length, offset);
  offset += 2;
  central.writeUInt16LE(0, offset);
  offset += 2;
  central.writeUInt16LE(0, offset);
  offset += 2;
  central.writeUInt16LE(0, offset);
  offset += 2;
  central.writeUInt16LE(0, offset);
  offset += 2;
  central.writeUInt32LE(0, offset);
  offset += 4;
  central.writeUInt32LE(0, offset);
  offset += 4;
  filename.copy(central, offset);

  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length, 12);
  end.writeUInt32LE(local.length, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([local, central, end]);
}

function lambdaSource(): string {
  return `const grantUrl = process.env.ADMISSION_LAMBDA_GRANT_URL;
const secret = process.env.ADMISSION_LAMBDA_SHARED_SECRET;
exports.handler = async (event) => {
  const batchItemFailures = [];
  for (const record of event?.Records ?? []) {
    const messageId = record.messageId || 'unknown-message';
    let body;
    try { body = JSON.parse(record.body || '{}'); } catch { continue; }
    if (!body.ticketId || !body.gateId) continue;
    try {
      const response = await fetch(grantUrl, { method: 'POST', headers: { 'content-type': 'application/json', 'x-admission-internal-secret': secret }, body: JSON.stringify({ ticketId: body.ticketId, gateId: body.gateId }) });
      if (!response.ok) { batchItemFailures.push({ itemIdentifier: messageId }); continue; }
      const result = await response.json();
      if (result.result === 'WAITING') batchItemFailures.push({ itemIdentifier: messageId });
    } catch { batchItemFailures.push({ itemIdentifier: messageId }); }
  }
  return { batchItemFailures };
};`;
}

async function main(): Promise<void> {
  const created = await sqs.send(
    new CreateQueueCommand({
      QueueName: queueName,
      Attributes: { VisibilityTimeout: '30', ReceiveMessageWaitTimeSeconds: '1' },
    }),
  );
  const queueUrl =
    created.QueueUrl ?? (await sqs.send(new GetQueueUrlCommand({ QueueName: queueName }))).QueueUrl;
  if (!queueUrl) throw new Error('LocalStack did not return an admission queue URL');
  if (!deployLambda) {
    console.log(JSON.stringify({ endpoint, queueName, queueUrl, lambda: 'disabled' }));
    return;
  }
  if (!sharedSecret)
    throw new Error(
      'ADMISSION_LAMBDA_SHARED_SECRET is required when deploying the LocalStack Lambda',
    );

  const attributes = await sqs.send(
    new GetQueueAttributesCommand({ QueueUrl: queueUrl, AttributeNames: ['QueueArn'] }),
  );
  const queueArn = attributes.Attributes?.QueueArn;
  if (!queueArn) throw new Error('LocalStack did not return the admission queue ARN');
  const lambda = new LambdaClient(clientOptions);
  const code = zipSingleFile('index.js', lambdaSource());
  const configuration = {
    FunctionName: functionName,
    Runtime: 'nodejs22.x',
    Role: 'arn:aws:iam::000000000000:role/lambda-execution-role',
    Handler: 'index.handler',
    Timeout: 10,
    MemorySize: 128,
    Environment: {
      Variables: {
        ADMISSION_LAMBDA_GRANT_URL: grantUrl,
        ADMISSION_LAMBDA_SHARED_SECRET: sharedSecret,
      },
    },
  } as const;
  try {
    await lambda.send(
      new CreateFunctionCommand({ ...configuration, Code: { ZipFile: code }, Publish: true }),
    );
  } catch (error) {
    const resourceConflict =
      error instanceof ResourceConflictException ||
      (error instanceof Error && error.name === 'ResourceConflictException');
    if (!resourceConflict) throw error;
    await lambda.send(
      new UpdateFunctionCodeCommand({ FunctionName: functionName, ZipFile: code, Publish: true }),
    );
    await lambda.send(new UpdateFunctionConfigurationCommand(configuration));
  }
  const functionArn = (await lambda.send(new GetFunctionCommand({ FunctionName: functionName })))
    .Configuration?.FunctionArn;
  if (!functionArn) throw new Error('LocalStack did not return the Lambda ARN');
  const mappings = await lambda.send(
    new ListEventSourceMappingsCommand({ EventSourceArn: queueArn, FunctionName: functionName }),
  );
  const mapping = mappings.EventSourceMappings?.[0];
  if (mapping?.UUID) {
    await lambda.send(
      new UpdateEventSourceMappingCommand({
        UUID: mapping.UUID,
        Enabled: true,
        BatchSize: 10,
        FunctionResponseTypes: ['ReportBatchItemFailures'],
      }),
    );
  } else {
    await lambda.send(
      new CreateEventSourceMappingCommand({
        EventSourceArn: queueArn,
        FunctionName: functionName,
        Enabled: true,
        BatchSize: 10,
        FunctionResponseTypes: ['ReportBatchItemFailures'],
      }),
    );
  }
  console.log(
    JSON.stringify({
      endpoint,
      queueName,
      queueUrl,
      queueArn,
      functionName,
      functionArn,
      grantUrl,
      lambda: 'deployed',
    }),
  );
  lambda.destroy();
}

void main().finally(() => sqs.destroy());
