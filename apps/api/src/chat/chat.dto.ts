import { IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, Length, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CHAT_REPORT_DETAILS_MAX_LENGTH, CHAT_REPORT_REASON_CODES } from '@shopee-clone/contracts';

export class SendChatMessageDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  recipientUserId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  clientMessageId!: string;

  @ApiProperty({ minLength: 1, maxLength: 2000 })
  @IsString()
  @Length(1, 2_000)
  content!: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  replyToMessageId?: string | null;
}

export class ChatAttentionDto {
  @ApiProperty({ maxLength: 80 })
  @IsString()
  @Length(1, 80)
  clientInstanceId!: string;

  @ApiProperty()
  @IsBoolean()
  engagedAtNewestRegion!: boolean;
}

export class ChatReportDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  conversationId!: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  messageId?: string | null;

  @ApiProperty({ enum: CHAT_REPORT_REASON_CODES })
  @IsIn([...CHAT_REPORT_REASON_CODES])
  reasonCode!: string;

  @ApiPropertyOptional({ maxLength: CHAT_REPORT_DETAILS_MAX_LENGTH, nullable: true })
  @IsOptional()
  @IsString()
  @Length(0, CHAT_REPORT_DETAILS_MAX_LENGTH)
  details?: string | null;
}

export class MarkChatReadDto {
  @ApiProperty({ minimum: 1, maximum: 2_147_483_647 })
  @IsInt()
  @Min(1)
  @Max(2_147_483_647)
  throughSequence!: number;
}

export class ChatConversationQueryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 50, type: Number })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;

  @ApiPropertyOptional({ description: 'Opaque conversation cursor' })
  @IsOptional()
  @IsString()
  @Length(1, 512)
  cursor?: string;

  @ApiPropertyOptional({ maxLength: 80 })
  @IsOptional()
  @IsString()
  @Length(0, 80)
  query?: string;
}

export class ChatMessageQueryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 50, type: Number })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;

  @ApiPropertyOptional({ minimum: 1, type: Number })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  beforeSequence?: number;

  @ApiPropertyOptional({ minimum: 1, type: Number })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  afterSequence?: number;
}
