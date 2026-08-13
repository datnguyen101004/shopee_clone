import type { BuyerProfile, ShippingAddress, ShippingAddressList } from '@shopee-clone/contracts';
import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Patch,
  Post,
  Put,
  Req,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNoContentResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { AuthGuard, type AuthenticatedRequest } from '../auth/auth.guard';
// DTO classes must remain runtime values for Nest validation metadata.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import {
  CreateShippingAddressDto,
  UpdateBuyerProfileDto,
  UpdateShippingAddressDto,
} from './account.dto';
import { AccountExceptionFilter } from './account-exception.filter';
import { AccountService } from './account.service';

@ApiTags('account')
@ApiBearerAuth()
@ApiResponse({ status: 400, description: 'Strict account DTO validation failed' })
@ApiResponse({ status: 401, description: 'Bearer session is missing or invalid' })
@ApiResponse({ status: 403, description: 'Mutation browser origin is not allowed' })
@ApiResponse({ status: 404, description: 'Address is invalid, missing, deleted, or not owned' })
@ApiResponse({ status: 409, description: 'Default-address invariant conflict' })
@ApiResponse({ status: 503, description: 'Account persistence is temporarily unavailable' })
@Controller('account')
@UseFilters(AccountExceptionFilter)
@UseGuards(AuthGuard)
export class AccountController {
  constructor(@Inject(AccountService) private readonly account: AccountService) {}

  @Get('profile')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Read the authenticated buyer profile' })
  @ApiResponse({ status: 200, description: 'Safe profile projection' })
  profile(@Req() request: AuthenticatedRequest): Promise<BuyerProfile> {
    return this.account.profile(request.authUser!.id);
  }

  @Patch('profile')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Update the authenticated buyer display name or Vietnamese phone' })
  @ApiResponse({ status: 200, description: 'Updated safe profile projection' })
  updateProfile(
    @Req() request: AuthenticatedRequest,
    @Body() input: UpdateBuyerProfileDto,
  ): Promise<BuyerProfile> {
    return this.account.updateProfile(request.authUser!.id, input);
  }

  @Get('addresses')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'List active owned shipping addresses, default first' })
  @ApiResponse({ status: 200, description: 'Owned address list' })
  addresses(@Req() request: AuthenticatedRequest): Promise<ShippingAddressList> {
    return this.account.addresses(request.authUser!.id);
  }

  @Post('addresses')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Create an owned shipping address' })
  @ApiResponse({ status: 201, description: 'Created address' })
  createAddress(
    @Req() request: AuthenticatedRequest,
    @Body() input: CreateShippingAddressDto,
  ): Promise<ShippingAddress> {
    return this.account.createAddress(request.authUser!.id, input);
  }

  @Patch('addresses/:addressId')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Edit mutable fields of an active owned shipping address' })
  @ApiResponse({ status: 200, description: 'Updated address' })
  updateAddress(
    @Req() request: AuthenticatedRequest,
    @Param('addressId') addressId: string,
    @Body() input: UpdateShippingAddressDto,
  ): Promise<ShippingAddress> {
    return this.account.updateAddress(request.authUser!.id, addressId, input);
  }

  @Delete('addresses/:addressId')
  @Header('Cache-Control', 'no-store')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete an active owned shipping address' })
  @ApiNoContentResponse({ description: 'Address removed and default invariant preserved' })
  deleteAddress(
    @Req() request: AuthenticatedRequest,
    @Param('addressId') addressId: string,
  ): Promise<void> {
    return this.account.deleteAddress(request.authUser!.id, addressId);
  }

  @Put('addresses/:addressId/default')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Idempotently select an active owned default shipping address' })
  @ApiResponse({ status: 200, description: 'Selected default address' })
  selectDefault(
    @Req() request: AuthenticatedRequest,
    @Param('addressId') addressId: string,
  ): Promise<ShippingAddress> {
    return this.account.selectDefault(request.authUser!.id, addressId);
  }
}
