import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const template = readFileSync(resolve(process.cwd(), '../../infra/clickstream/template.yaml'), 'utf8');

describe('clickstream Firehose delivery contract', () => {
  it('uses safe ISO string slices for dynamic partition metadata', () => {
    expect(template).toContain('AppendDelimiterToRecord');
    expect(template).toContain('dt:.ingestedAt[0:10]');
    expect(template).toContain('hour:.ingestedAt[11:13]');
    expect(template).not.toContain('fromdateiso8601');
  });

  it('attaches the ingestion route to the supplied existing HTTP API', () => {
    expect(template).toContain('ExistingHttpApiId');
    expect(template).toContain('AWS::ApiGatewayV2::Integration');
    expect(template).toContain('AWS::ApiGatewayV2::Route');
    expect(template).toContain('RouteKey: POST /clickstream/events');
    expect(template).not.toContain('AWS::ApiGateway::RestApi');
    expect(template).not.toContain('AWS::ApiGateway::Deployment');
  });

  it('keeps data retention, Glue artifact access, and log delivery stack-safe', () => {
    const athenaRole = template.slice(template.indexOf('AthenaQueryRole:'), template.indexOf('GlueEtlRole:'));
    const glueRole = template.slice(template.indexOf('GlueEtlRole:'), template.indexOf('SchedulerRole:'));
    expect(template.match(/DeletionPolicy: Retain/g)).toHaveLength(2);
    expect(template.match(/UpdateReplacePolicy: Retain/g)).toHaveLength(2);
    expect(athenaRole).not.toContain('GlueScriptS3Bucket');
    expect(glueRole).toContain('GlueScriptS3Bucket');
    expect(glueRole).toContain('GlueScriptS3Key');
    expect(template).not.toContain('GlueErrorLogGroup:');
    expect(template).not.toContain('GlueOutputLogGroup:');
    expect(template).toContain('FirehoseDeliveryLogStream:');
    expect(template).toContain('LogStreamName: !Ref FirehoseDeliveryLogStream');
    expect(template).toContain('AthenaBackendPrincipalArn');
    expect(template).toContain('AWS: !Ref AthenaBackendPrincipalArn');
    expect(template).toContain("'arn:${AWS::Partition}:s3:::${RawBucketName}/raw-errors/*'");
    expect(template).toContain('s3:ListBucketMultipartUploads');
    expect(template).toContain('s3:ListMultipartUploadParts');
    const firehoseRole = template.slice(template.indexOf('FirehoseDeliveryRole:'), template.indexOf('AthenaQueryRole:'));
    expect(firehoseRole).toContain('s3:GetObject');
  });

  it('can reuse existing data buckets without conditional-resource references', () => {
    expect(template).toContain('CreateDataBuckets:');
    expect(template).toContain("Default: 'true'");
    expect(template).toContain("AllowedValues: ['true', 'false']");
    expect(template).toContain("CreateDataBucketsCondition: !Equals [!Ref CreateDataBuckets, 'true']");
    expect(template.match(/Condition: CreateDataBucketsCondition/g)).toHaveLength(2);
    expect(template).not.toContain('RawBucket.Arn');
    expect(template).not.toContain('ProcessedBucket.Arn');
    expect(template).toContain('arn:${AWS::Partition}:s3:::${RawBucketName}');
    expect(template).toContain('arn:${AWS::Partition}:s3:::${ProcessedBucketName}');
    expect(template).toContain('RawBucketName: { Value: !Ref RawBucketName }');
    expect(template).toContain('ProcessedBucketName: { Value: !Ref ProcessedBucketName }');
  });

  it('keeps Glue Catalog and Athena names aligned with the backend defaults', () => {
    expect(template).toContain('AthenaDatabaseName:');
    expect(template).toContain('Default: clickstream');
    expect(template).toContain('AthenaTableName:');
    expect(template).toContain('Default: raw_clickstream_events');
    expect(template).toContain('AthenaWorkGroupName:');
    expect(template).toContain('Default: clickstream-mvp');
    expect(template).toContain('Name: !Ref AthenaDatabaseName');
    expect(template).toContain('Name: !Ref AthenaTableName');
    expect(template).toContain('Name: !Ref AthenaWorkGroupName');
    expect(template).toContain('database/${AthenaDatabaseName}');
    expect(template).toContain('table/${AthenaDatabaseName}/${AthenaTableName}');
    expect(template).not.toContain('${AWS::StackName}-clickstream');
    expect(template).not.toContain('${AWS::StackName}-workgroup');
  });

  it('exposes validated event properties for seller cart-add aggregation', () => {
    expect(template).toContain('Name: properties');
    expect(template).toContain('struct<action:string');
    expect(template).toContain('quantity:int');
  });

  it('quotes the EventBridge Scheduler OFF enum for YAML 1.1 parsers', () => {
    expect(template).toContain("FlexibleTimeWindow: { Mode: 'OFF' }");
    expect(template).not.toContain('FlexibleTimeWindow: { Mode: OFF }');
  });

  it('nests dynamic partitioning under the Extended S3 destination', () => {
    const firehose = template.slice(template.indexOf('RawFirehose:'), template.indexOf('ClickstreamGlueDatabase:'));
    const propertiesBeforeDestination = firehose.slice(firehose.indexOf('Properties:'), firehose.indexOf('ExtendedS3DestinationConfiguration:'));
    const destination = firehose.slice(firehose.indexOf('ExtendedS3DestinationConfiguration:'));
    expect(propertiesBeforeDestination).not.toContain('DynamicPartitioningConfiguration:');
    expect(destination).toContain('DynamicPartitioningConfiguration: { Enabled: true');
    expect(destination).toContain('BufferingHints: { IntervalInSeconds: 60, SizeInMBs: 64 }');
  });
});
