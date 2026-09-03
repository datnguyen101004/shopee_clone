import { describe, expect, it } from 'vitest';
import {
  ADMIN_REVIEW_VISIBILITY_ACTIONS,
  MODERATION_CASE_EVENT_TYPES,
  MODERATION_CASE_OUTCOMES,
  MODERATION_CASE_STATUSES,
  MODERATION_DECISION_OUTCOMES,
  MODERATION_DEFAULT_LIMIT,
  MODERATION_MAX_LIMIT,
  MODERATION_PRIVATE_NOTE_MAX_LENGTH,
  PRODUCT_REPORT_REASON_CODES,
  REPORT_DETAILS_MAX_LENGTH,
  REPORT_DETAILS_MIN_LENGTH,
  REPORT_EVIDENCE_URL_MAX_LENGTH,
  REPORT_MAX_EVIDENCE_URLS,
  REPORT_RATE_LIMIT_DAILY_ACCEPTED,
  REPORT_RATE_LIMIT_HOURLY_ATTEMPTS,
  REPORT_REASON_MAX_LENGTH,
  REPORT_REASON_MIN_LENGTH,
  REPORT_STATUSES,
  REPORT_TARGET_TYPES,
  SELLER_NOTICES_DEFAULT_LIMIT,
  SELLER_NOTICES_MAX_LIMIT,
  SELLER_NOTICE_ACTIONS,
  SELLER_REVIEW_REPORT_REASON_CODES,
  SHOP_REPORT_REASON_CODES,
  isCanonicalUuid,
  isReportStatus,
  isReportTargetType,
  isSellerReviewReportReasonCode,
  isValidEvidenceUrl,
  isValidEvidenceUrlList,
  isValidPrivateNote,
  isValidProductReportReason,
  isValidPublicReason,
  isValidReportDetails,
  isValidShopReportReason,
  isValidSellerReviewReportDetails,
  parseAddModerationCaseNoteRequest,
  parseAdminReviewActionRequest,
  parseAssignModerationCaseRequest,
  parseCreateModerationDecisionRequest,
  parseCreateReportRequest,
  parseCreateSellerReviewReportRequest,
  parseModerationCaseListQuery,
  parseModerationProblemDetails,
  parseReporterReportListQuery,
  parseSellerModerationNoticeListQuery,
} from '../src/moderation';

describe('Moderation and Reporting Contracts', () => {
  it('defines valid enums and bounds constants', () => {
    expect(REPORT_TARGET_TYPES).toEqual(['PRODUCT', 'SHOP', 'CHAT_CONVERSATION', 'CHAT_MESSAGE']);
    expect(PRODUCT_REPORT_REASON_CODES).toEqual([
      'PROHIBITED_ITEM',
      'COUNTERFEIT',
      'MISLEADING_INFORMATION',
      'INAPPROPRIATE_CONTENT',
      'OTHER',
    ]);
    expect(SHOP_REPORT_REASON_CODES).toEqual([
      'FRAUD_SCAM',
      'ABUSIVE_BEHAVIOR',
      'PROHIBITED_SELLER',
      'INAPPROPRIATE_CONTENT',
      'OTHER',
    ]);
    expect(REPORT_STATUSES).toEqual(['SUBMITTED', 'REVIEWED']);
    expect(MODERATION_CASE_STATUSES).toEqual(['OPEN', 'IN_REVIEW', 'RESOLVED']);
    expect(MODERATION_CASE_OUTCOMES).toEqual([
      'NO_ACTION',
      'SUSPEND_TARGET',
      'RESTORE_TARGET',
      'WARN_USER',
      'RESTRICT_CHAT_TEMPORARY',
      'RESTRICT_CHAT_INDEFINITE',
      'RESTORE_CHAT',
    ]);
    expect(MODERATION_DECISION_OUTCOMES).toEqual(MODERATION_CASE_OUTCOMES);
    expect(MODERATION_CASE_EVENT_TYPES).toEqual([
      'REPORT_ATTACHED',
      'ASSIGNED',
      'UNASSIGNED',
      'NOTE_ADDED',
      'DECISION_MADE',
      'DECISION_REVERSED',
    ]);
    expect(ADMIN_REVIEW_VISIBILITY_ACTIONS).toEqual(['HIDE', 'RESTORE', 'KEEP_VISIBLE']);
    expect(SELLER_REVIEW_REPORT_REASON_CODES).toEqual([
      'ABUSIVE_CONTENT',
      'IRRELEVANT_CONTENT',
      'SPAM_OR_FRAUD',
      'OTHER',
    ]);
    expect(SELLER_NOTICE_ACTIONS).toEqual([
      'PRODUCT_SUSPENDED',
      'PRODUCT_RESTORED',
      'SHOP_SUSPENDED',
      'SHOP_RESTORED',
    ]);

    expect(REPORT_DETAILS_MIN_LENGTH).toBe(20);
    expect(REPORT_DETAILS_MAX_LENGTH).toBe(1000);
    expect(REPORT_MAX_EVIDENCE_URLS).toBe(3);
    expect(REPORT_EVIDENCE_URL_MAX_LENGTH).toBe(2048);
    expect(REPORT_RATE_LIMIT_HOURLY_ATTEMPTS).toBe(20);
    expect(REPORT_RATE_LIMIT_DAILY_ACCEPTED).toBe(10);
    expect(REPORT_REASON_MIN_LENGTH).toBe(8);
    expect(REPORT_REASON_MAX_LENGTH).toBe(240);
    expect(MODERATION_PRIVATE_NOTE_MAX_LENGTH).toBe(2000);
    expect(MODERATION_DEFAULT_LIMIT).toBe(20);
    expect(MODERATION_MAX_LIMIT).toBe(50);
    expect(SELLER_NOTICES_DEFAULT_LIMIT).toBe(20);
    expect(SELLER_NOTICES_MAX_LIMIT).toBe(50);
  });

  describe('Type Guards', () => {
    it('validates canonical UUIDs', () => {
      expect(isCanonicalUuid('123e4567-e89b-12d3-a456-426614174000')).toBe(true);
      expect(isCanonicalUuid('123E4567-E89B-12D3-A456-426614174000')).toBe(true);
      expect(isCanonicalUuid('not-a-uuid')).toBe(false);
      expect(isCanonicalUuid('')).toBe(false);
      expect(isCanonicalUuid(null)).toBe(false);
      expect(isCanonicalUuid(123)).toBe(false);
    });

    it('validates report target types and statuses', () => {
      expect(isReportTargetType('PRODUCT')).toBe(true);
      expect(isReportTargetType('SHOP')).toBe(true);
      expect(isReportTargetType('USER')).toBe(false);
      expect(isReportStatus('SUBMITTED')).toBe(true);
      expect(isReportStatus('REVIEWED')).toBe(true);
      expect(isReportStatus('PENDING')).toBe(false);
    });

    it('validates product vs shop report reasons', () => {
      expect(isValidProductReportReason('COUNTERFEIT')).toBe(true);
      expect(isValidProductReportReason('PROHIBITED_ITEM')).toBe(true);
      expect(isValidProductReportReason('FRAUD_SCAM')).toBe(false);

      expect(isValidShopReportReason('FRAUD_SCAM')).toBe(true);
      expect(isValidShopReportReason('PROHIBITED_SELLER')).toBe(true);
      expect(isValidShopReportReason('COUNTERFEIT')).toBe(false);
    });

    it('validates seller-only review report reasons and optional details', () => {
      expect(isSellerReviewReportReasonCode('ABUSIVE_CONTENT')).toBe(true);
      expect(isSellerReviewReportReasonCode('COUNTERFEIT')).toBe(false);
      expect(isValidSellerReviewReportDetails('Context from the seller')).toBe(true);
      expect(isValidSellerReviewReportDetails('')).toBe(false);
      expect(isValidSellerReviewReportDetails('a'.repeat(1001))).toBe(false);
      expect(isValidSellerReviewReportDetails('Invalid\x00 detail')).toBe(false);
    });

    it('validates report details bounds and rejects control characters', () => {
      expect(isValidReportDetails('Too short')).toBe(false);
      expect(isValidReportDetails('This is a valid report description with sufficient details.')).toBe(true);
      expect(isValidReportDetails('a'.repeat(20))).toBe(true);
      expect(isValidReportDetails('a'.repeat(1000))).toBe(true);
      expect(isValidReportDetails('a'.repeat(1001))).toBe(false);
      expect(isValidReportDetails('Valid report with \x00 null byte')).toBe(false);
    });

    it('validates public reason and private note bounds', () => {
      expect(isValidPublicReason('Short')).toBe(false);
      expect(isValidPublicReason('Valid public reason for policy violation')).toBe(true);
      expect(isValidPublicReason('a'.repeat(240))).toBe(true);
      expect(isValidPublicReason('a'.repeat(241))).toBe(false);

      expect(isValidPrivateNote('')).toBe(false);
      expect(isValidPrivateNote('Internal investigator notes')).toBe(true);
      expect(isValidPrivateNote('a'.repeat(2000))).toBe(true);
      expect(isValidPrivateNote('a'.repeat(2001))).toBe(false);
    });

    it('validates evidence URLs (HTTPS only, valid format, max items)', () => {
      expect(isValidEvidenceUrl('https://example.com/screenshot.png')).toBe(true);
      expect(isValidEvidenceUrl('http://insecure.com/photo.jpg')).toBe(false);
      expect(isValidEvidenceUrl('ftp://example.com/file')).toBe(false);
      expect(isValidEvidenceUrl('javascript:alert(1)')).toBe(false);
      expect(isValidEvidenceUrl('https://' + 'a'.repeat(2048))).toBe(false);

      expect(isValidEvidenceUrlList(['https://example.com/1.png', 'https://example.com/2.png'])).toBe(true);
      expect(
        isValidEvidenceUrlList([
          'https://example.com/1.png',
          'https://example.com/2.png',
          'https://example.com/3.png',
          'https://example.com/4.png',
        ]),
      ).toBe(false);
      expect(isValidEvidenceUrlList(['https://example.com/1.png', 'http://example.com/2.png'])).toBe(false);
    });
  });

  describe('Parsers', () => {
    const validUuid = '123e4567-e89b-12d3-a456-426614174000';

    it('parses valid CreateReportRequest and rejects invalid inputs', () => {
      const valid = {
        targetType: 'PRODUCT',
        targetId: validUuid,
        reasonCode: 'PROHIBITED_ITEM',
        details: 'This product violates marketplace policies regarding prohibited items.',
        evidenceUrls: ['https://cdn.example.com/proof1.jpg'],
      };
      expect(parseCreateReportRequest(valid)).toEqual(valid);

      // Unknown extra field
      expect(parseCreateReportRequest({ ...valid, extraField: 'invalid' })).toBeNull();
      // Wrong reason for product
      expect(parseCreateReportRequest({ ...valid, reasonCode: 'FRAUD_SCAM' })).toBeNull();
      // Invalid evidence URL scheme
      expect(
        parseCreateReportRequest({ ...valid, evidenceUrls: ['http://insecure.com/proof.jpg'] }),
      ).toBeNull();
    });

    it('parses a strict seller review report request', () => {
      expect(parseCreateSellerReviewReportRequest({
        reasonCode: 'SPAM_OR_FRAUD',
        details: '  Review links to an unrelated payment page.  ',
      })).toEqual({
        reasonCode: 'SPAM_OR_FRAUD',
        details: 'Review links to an unrelated payment page.',
      });
      expect(parseCreateSellerReviewReportRequest({ reasonCode: 'OTHER' })).toEqual({ reasonCode: 'OTHER' });
      expect(parseCreateSellerReviewReportRequest({ reasonCode: 'COUNTERFEIT' })).toBeNull();
      expect(parseCreateSellerReviewReportRequest({ reasonCode: 'OTHER', unexpected: true })).toBeNull();
    });

    it('parses ReporterReportListQuery', () => {
      expect(parseReporterReportListQuery({ limit: 15, targetType: 'PRODUCT', status: 'SUBMITTED' })).toEqual({
        limit: 15,
        targetType: 'PRODUCT',
        status: 'SUBMITTED',
      });
      expect(parseReporterReportListQuery({ limit: 0 })).toBeNull();
      expect(parseReporterReportListQuery({ limit: 100 })).toBeNull();
      expect(parseReporterReportListQuery({ unknown: 'field' })).toBeNull();
    });

    it('parses ModerationCaseListQuery', () => {
      expect(
        parseModerationCaseListQuery({
          limit: 25,
          status: 'OPEN',
          targetType: 'SHOP',
          targetId: validUuid,
          assignedState: 'UNASSIGNED',
        }),
      ).toEqual({
        limit: 25,
        status: 'OPEN',
        targetType: 'SHOP',
        targetId: validUuid,
        assignedState: 'UNASSIGNED',
      });
      expect(parseModerationCaseListQuery({ assignedState: 'INVALID' })).toBeNull();
      expect(parseModerationCaseListQuery({ targetId: 'not-a-uuid' })).toBeNull();
    });

    it('parses AssignModerationCaseRequest and AddModerationCaseNoteRequest', () => {
      expect(parseAssignModerationCaseRequest({ assignedAdminId: validUuid, expectedVersion: 3 })).toEqual({
        assignedAdminId: validUuid,
        expectedVersion: 3,
      });
      expect(parseAssignModerationCaseRequest({ assignedAdminId: null, expectedVersion: 0 })).toEqual({
        assignedAdminId: null,
        expectedVersion: 0,
      });
      expect(parseAssignModerationCaseRequest({ assignedAdminId: 'invalid-uuid', expectedVersion: 1 })).toBeNull();

      expect(
        parseAddModerationCaseNoteRequest({
          note: 'Investigated seller records; suspicious activity confirmed.',
          expectedVersion: 5,
        }),
      ).toEqual({
        note: 'Investigated seller records; suspicious activity confirmed.',
        expectedVersion: 5,
      });
    });

    it('parses CreateModerationDecisionRequest', () => {
      const valid = {
        outcome: 'SUSPEND_TARGET',
        publicReason: 'Violation of counterfeit goods policy confirmed upon review.',
        privateNote: 'Case reviewed with brand protection team.',
        reversesDecisionId: validUuid,
        expectedVersion: 2,
      };
      expect(parseCreateModerationDecisionRequest(valid)).toEqual(valid);

      // Stale or invalid version
      expect(parseCreateModerationDecisionRequest({ ...valid, expectedVersion: -1 })).toBeNull();
      // Public reason too short
      expect(parseCreateModerationDecisionRequest({ ...valid, publicReason: 'Short' })).toBeNull();
    });

    it('parses AdminReviewActionRequest', () => {
      expect(
        parseAdminReviewActionRequest({
          action: 'HIDE',
          reason: 'Review contains profane and abusive language.',
          expectedVersion: 1,
        }),
      ).toEqual({
        action: 'HIDE',
        reason: 'Review contains profane and abusive language.',
        expectedVersion: 1,
      });
      expect(
        parseAdminReviewActionRequest({
          action: 'DELETE',
          reason: 'Review contains profane and abusive language.',
          expectedVersion: 1,
        }),
      ).toBeNull();
    });

    it('parses SellerModerationNoticeListQuery', () => {
      expect(parseSellerModerationNoticeListQuery({ limit: 10, unreadOnly: true })).toEqual({
        limit: 10,
        unreadOnly: true,
      });
      expect(parseSellerModerationNoticeListQuery({ unreadOnly: 'true' })).toEqual({
        unreadOnly: true,
      });
      expect(parseSellerModerationNoticeListQuery({ unreadOnly: 'invalid' })).toBeNull();
    });

    it('parses ModerationProblemDetails', () => {
      const problem = {
        type: 'https://api.shopee.local/errors/conflict',
        title: 'Conflict',
        status: 409,
        detail: 'Case version has been modified by another admin.',
        currentVersion: 4,
      };
      expect(parseModerationProblemDetails(problem)).toEqual(problem);
    });
  });
});
