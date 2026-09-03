import {
  AUTH_DISPLAY_NAME_MAX_LENGTH,
  AUTH_DISPLAY_NAME_MIN_LENGTH,
  AUTH_EMAIL_MAX_LENGTH,
  AUTH_PASSWORD_MAX_LENGTH,
  AUTH_PASSWORD_MIN_LENGTH,
  normalizeAuthEmail,
} from '@shopee-clone/contracts';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsString, Length, Matches } from 'class-validator';

export class RegisterDto {
  @ApiProperty({ minLength: AUTH_DISPLAY_NAME_MIN_LENGTH, maxLength: AUTH_DISPLAY_NAME_MAX_LENGTH })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(AUTH_DISPLAY_NAME_MIN_LENGTH, AUTH_DISPLAY_NAME_MAX_LENGTH)
  displayName!: string;

  @ApiProperty({ example: 'buyer@example.com', maxLength: AUTH_EMAIL_MAX_LENGTH })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? normalizeAuthEmail(value) : value,
  )
  @IsEmail()
  @Length(3, AUTH_EMAIL_MAX_LENGTH)
  email!: string;

  @ApiProperty({ minLength: AUTH_PASSWORD_MIN_LENGTH, maxLength: AUTH_PASSWORD_MAX_LENGTH })
  @IsString()
  @Length(AUTH_PASSWORD_MIN_LENGTH, AUTH_PASSWORD_MAX_LENGTH)
  password!: string;
}

export class LoginDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? normalizeAuthEmail(value) : value,
  )
  @IsEmail()
  @Length(3, AUTH_EMAIL_MAX_LENGTH)
  email!: string;

  @IsString()
  @Length(1, AUTH_PASSWORD_MAX_LENGTH)
  password!: string;
}

export class ForgotPasswordDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? normalizeAuthEmail(value) : value,
  )
  @IsEmail()
  @Length(3, AUTH_EMAIL_MAX_LENGTH)
  email!: string;
}

export class ResetPasswordDto {
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{43,128}$/)
  token!: string;

  @IsString()
  @Length(AUTH_PASSWORD_MIN_LENGTH, AUTH_PASSWORD_MAX_LENGTH)
  password!: string;
}
