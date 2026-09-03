import {
  isCanonicalUuid,
  type MarkSellerNoticeReadResponse,
  type SellerModerationNoticeListQuery,
  type SellerModerationNoticeListResponse,
} from '@shopee-clone/contracts';
import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { SellerModerationNoticesRepository } from './seller-moderation-notices.repository';

@Injectable()
export class SellerModerationNoticesService {
  constructor(
    @Inject(SellerModerationNoticesRepository)
    private readonly repository: SellerModerationNoticesRepository,
  ) {}

  async listNotices(
    ownerUserId: string,
    query: SellerModerationNoticeListQuery,
  ): Promise<SellerModerationNoticeListResponse> {
    return this.repository.listNotices(ownerUserId, query);
  }

  async markRead(
    ownerUserId: string,
    noticeId: string,
  ): Promise<MarkSellerNoticeReadResponse> {
    if (!isCanonicalUuid(noticeId)) {
      throw new BadRequestException('Invalid notice identifier');
    }
    return this.repository.markRead(ownerUserId, noticeId);
  }
}
