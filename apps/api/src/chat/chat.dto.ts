import { IsInt, IsOptional, IsString, IsUUID, Length, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class SendChatMessageDto {
  @IsUUID()
  recipientUserId!: string;

  @IsUUID()
  clientMessageId!: string;

  @IsString()
  @Length(1, 2_000)
  content!: string;
}

export class MarkChatReadDto {
  @IsInt()
  @Min(1)
  @Max(2_147_483_647)
  throughSequence!: number;
}

export class ChatConversationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;

  @IsOptional()
  @IsString()
  @Length(1, 512)
  cursor?: string;

  @IsOptional()
  @IsString()
  @Length(0, 80)
  query?: string;
}

export class ChatMessageQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  beforeSequence?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  afterSequence?: number;
}
