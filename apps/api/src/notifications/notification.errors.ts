export class NotificationValidationError extends Error {
  constructor(readonly invalidParameters: string[]) {
    super('Invalid notification request');
    this.name = 'NotificationValidationError';
  }
}

export class NotificationNotFoundError extends Error {
  constructor() {
    super('Notification not found');
    this.name = 'NotificationNotFoundError';
  }
}

export class NotificationPreferenceForbiddenError extends Error {
  constructor(readonly invalidParameters: string[] = ['enabled']) {
    super('Mandatory notification preference cannot be disabled');
    this.name = 'NotificationPreferenceForbiddenError';
  }
}

export class NotificationUnavailableError extends Error {
  constructor() {
    super('Notifications temporarily unavailable');
    this.name = 'NotificationUnavailableError';
  }
}
