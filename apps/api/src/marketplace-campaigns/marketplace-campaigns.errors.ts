export class MarketplaceCampaignError extends Error { constructor(public readonly code: string, message: string, public readonly status = 400) { super(message); } }
export class MarketplaceCampaignNotFoundError extends MarketplaceCampaignError { constructor() { super('CAMPAIGN_NOT_FOUND', 'Campaign is unavailable.', 404); } }
export class MarketplaceCampaignValidationError extends MarketplaceCampaignError { constructor(public readonly fields: string[], message = 'One or more campaign fields are invalid.') { super('INVALID_CAMPAIGN_REQUEST', message, 400); } }
export class MarketplaceCampaignConflictError extends MarketplaceCampaignError { constructor(code: string, message: string) { super(code, message, 409); } }
export class MarketplaceCampaignStaleError extends MarketplaceCampaignError { constructor(public readonly currentVersion: number) { super('CAMPAIGN_STALE', 'Campaign was changed by another administrator.', 412); } }
export class MarketplaceCampaignForbiddenError extends MarketplaceCampaignError { constructor() { super('CAMPAIGN_FORBIDDEN', 'The account cannot manage this campaign.', 403); } }
