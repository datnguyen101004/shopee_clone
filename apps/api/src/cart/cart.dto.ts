import { IsBoolean, IsInt, IsUUID, Max, Min } from 'class-validator';

export class AddCartItemDto {
  @IsUUID()
  variantId!: string;

  @IsInt()
  @Min(1)
  @Max(99)
  quantity!: number;
}

export class UpdateCartQuantityDto {
  @IsInt()
  @Min(1)
  @Max(99)
  quantity!: number;
}

export class UpdateCartSelectionDto {
  @IsBoolean()
  selected!: boolean;
}
