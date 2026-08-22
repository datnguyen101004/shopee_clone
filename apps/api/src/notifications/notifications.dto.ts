import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import {
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_CHANNELS,
  NOTIFICATION_DEFAULT_LIMIT,
  NOTIFICATION_MAX_LIMIT,
  type NotificationCategory,
  type NotificationChannel,
} from '@shopee-clone/contracts';

export class NotificationListQueryDto {
  @ApiPropertyOptional({ enum: ['ALL', ...NOTIFICATION_CATEGORIES], default: 'ALL' })
  @IsOptional()
  @IsIn(['ALL', ...NOTIFICATION_CATEGORIES])
  category?: NotificationCategory | 'ALL';

  @ApiPropertyOptional({ default: NOTIFICATION_DEFAULT_LIMIT, maximum: NOTIFICATION_MAX_LIMIT })
  @IsOptional()
  @Transform(({ value }) => (value === undefined || value === null || value === '' ? undefined : Number(value)))
  @IsInt()
  @Min(1)
  @Max(NOTIFICATION_MAX_LIMIT)
  limit?: number;

  @ApiPropertyOptional({ description: 'Keyset cursor from a previous page' })
  @IsOptional()
  @IsString()
  cursor?: string;
}

export class UpdateNotificationPreferenceDto {
  @ApiProperty({ enum: NOTIFICATION_CATEGORIES })
  @IsIn([...NOTIFICATION_CATEGORIES])
  category!: NotificationCategory;

  @ApiProperty({ enum: NOTIFICATION_CHANNELS })
  @IsIn([...NOTIFICATION_CHANNELS])
  channel!: NotificationChannel;

  @ApiProperty()
  @IsBoolean()
  enabled!: boolean;
}
