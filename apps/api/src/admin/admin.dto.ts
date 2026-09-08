import {
  ADMIN_DEFAULT_LIMIT,
  ADMIN_BANNER_MEDIA_MIME_TYPES,
  ADMIN_MAX_LIMIT,
  ADMIN_PRIVILEGED_ACTIONS,
  ADMIN_PRIVILEGED_TARGET_TYPES,
  ADMIN_SHOP_ONBOARDING_STATUSES,
  ADMIN_SHOP_STATUSES,
  ADMIN_USER_STATUSES,
  type AdminPrivilegedAction,
  type AdminPrivilegedTargetType,
  type AdminShopActionRequest,
  type AdminShopOnboardingStatus,
  type AdminShopStatus,
  type AdminUserActionRequest,
  type AdminUserStatus,
  type CreateAdminBannerRequest,
  type AdminBannerMediaUploadIntentRequest,
  type CreateAdminCategoryRequest,
  type ReorderAdminBannersRequest,
  type ReorderAdminCategoriesRequest,
  type UpdateAdminBannerRequest,
  type UpdateAdminCategoryRequest,
  type UpdateAdminHomepageModuleSettingsRequest,
} from '@shopee-clone/contracts';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  Matches,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class AdminUserListQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @IsIn(ADMIN_USER_STATUSES)
  status?: AdminUserStatus;

  @IsOptional()
  @IsIn(['buyer', 'seller', 'admin', 'carrier_operator'])
  role?: 'buyer' | 'seller' | 'admin' | 'carrier_operator';

  @IsOptional()
  @IsString()
  q?: string;
}

export class AdminUserActionDto implements AdminUserActionRequest {
  @IsIn(['SUSPEND', 'RESTORE'])
  action!: 'SUSPEND' | 'RESTORE';

  @IsString()
  @MinLength(8)
  @MaxLength(240)
  reason!: string;
}

export class AdminShopListQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @IsIn(ADMIN_SHOP_STATUSES)
  status?: AdminShopStatus;

  @IsOptional()
  @IsIn(ADMIN_SHOP_ONBOARDING_STATUSES)
  onboardingStatus?: AdminShopOnboardingStatus;

  @IsOptional()
  @IsString()
  q?: string;
}

export class AdminShopActionDto implements AdminShopActionRequest {
  @IsIn(['SUSPEND', 'RESTORE'])
  action!: 'SUSPEND' | 'RESTORE';

  @IsString()
  @MinLength(8)
  @MaxLength(240)
  reason!: string;
}

export class AdminProductListQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsIn(['DRAFT', 'ACTIVE', 'HIDDEN', 'ARCHIVED'])
  status?: 'DRAFT' | 'ACTIVE' | 'HIDDEN' | 'ARCHIVED';

  @IsOptional()
  @IsIn(['ACTIVE', 'SUSPENDED'])
  moderationStatus?: 'ACTIVE' | 'SUSPENDED';
}

export class CreateAdminCategoryDto implements CreateAdminCategoryRequest {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  slug!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @IsUUID()
  parentId?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateAdminCategoryDto implements UpdateAdminCategoryRequest {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  slug?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsUUID()
  parentId?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class ReorderCategoryItemDto {
  @IsUUID()
  id!: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder!: number;
}

export class ReorderAdminCategoriesDto implements ReorderAdminCategoriesRequest {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ReorderCategoryItemDto)
  items!: ReorderCategoryItemDto[];
}

export class CreateAdminBannerDto implements CreateAdminBannerRequest {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  eyebrow?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  description?: string;

  @IsOptional()
  @IsString()
  imageUrl?: string | null;

  @IsOptional()
  @IsUUID()
  imageAssetId?: string | null;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  altText!: string;

  @IsOptional()
  @IsString()
  href?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  theme!: string;

  @IsOptional()
  @IsIn(['CAMPAIGN', 'PRODUCT', 'SHOP', 'CATEGORY', 'SEARCH', 'URL'])
  targetType?: 'CAMPAIGN' | 'PRODUCT' | 'SHOP' | 'CATEGORY' | 'SEARCH' | 'URL';

  @IsOptional()
  @IsUUID()
  targetId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  targetQuery?: string | null;

  @IsOptional()
  @IsString()
  displayFrom?: string | null;

  @IsOptional()
  @IsString()
  displayUntil?: string | null;

  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  priority?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class UpdateAdminBannerDto implements UpdateAdminBannerRequest {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  eyebrow?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  description?: string;

  @IsOptional()
  @IsString()
  imageUrl?: string | null;

  @IsOptional()
  @IsUUID()
  imageAssetId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  altText?: string;

  @IsOptional()
  @IsString()
  href?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  theme?: string;

  @IsOptional()
  @IsIn(['CAMPAIGN', 'PRODUCT', 'SHOP', 'CATEGORY', 'SEARCH', 'URL'])
  targetType?: 'CAMPAIGN' | 'PRODUCT' | 'SHOP' | 'CATEGORY' | 'SEARCH' | 'URL';

  @IsOptional()
  @IsUUID()
  targetId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  targetQuery?: string | null;

  @IsOptional()
  @IsString()
  displayFrom?: string | null;

  @IsOptional()
  @IsString()
  displayUntil?: string | null;

  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  priority?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class CreateAdminBannerMediaUploadIntentDto implements AdminBannerMediaUploadIntentRequest {
  @IsIn(ADMIN_BANNER_MEDIA_MIME_TYPES)
  mimeType!: AdminBannerMediaUploadIntentRequest['mimeType'];

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5_000_000)
  byteSize!: number;

  @IsString()
  @Matches(/^[A-Za-z0-9+/]{43}=$/)
  checksumSha256!: string;
}

export class ReorderBannerItemDto {
  @IsUUID()
  id!: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder!: number;
}

export class ReorderAdminBannersDto implements ReorderAdminBannersRequest {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ReorderBannerItemDto)
  items!: ReorderBannerItemDto[];
}

export class UpdateAdminHomepageModuleSettingsDto
  implements UpdateAdminHomepageModuleSettingsRequest
{
  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  subtitle?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;

  @IsOptional()
  @IsString()
  activeFrom?: string | null;

  @IsOptional()
  @IsString()
  activeUntil?: string | null;
}

export class AdminPrivilegedAuditQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(ADMIN_MAX_LIMIT)
  limit?: number = ADMIN_DEFAULT_LIMIT;

  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @IsIn(ADMIN_PRIVILEGED_TARGET_TYPES)
  targetType?: AdminPrivilegedTargetType;

  @IsOptional()
  @IsUUID()
  targetId?: string;

  @IsOptional()
  @IsUUID()
  actorUserId?: string;

  @IsOptional()
  @IsIn(ADMIN_PRIVILEGED_ACTIONS)
  action?: AdminPrivilegedAction;
}

export class AdminProductLookupQueryDto {
  @IsOptional()
  @IsString()
  slug?: string;

  @IsOptional()
  @IsString()
  id?: string;
}

export class AdminProductActionDto {
  @IsIn(['SUSPEND', 'RESTORE'])
  action!: 'SUSPEND' | 'RESTORE';

  @IsString()
  @MinLength(8)
  @MaxLength(240)
  reason!: string;
}
