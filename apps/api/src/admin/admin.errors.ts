export class AdminError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class LastAdminConflictError extends AdminError {
  constructor(message = 'Cannot suspend the last active administrator') {
    super(message, 409, 'LAST_ADMIN');
  }
}

export class SelfActionForbiddenError extends AdminError {
  constructor(message = 'Administrators cannot perform this action on themselves') {
    super(message, 400, 'SELF_ACTION_FORBIDDEN');
  }
}

export class ShopRestoreNotApprovedError extends AdminError {
  constructor(message = 'Only approved shops can be restored to active status') {
    super(message, 409, 'SHOP_NOT_APPROVED');
  }
}

export class CategoryIntegrityConflictError extends AdminError {
  constructor(
    message = 'Category cannot be deleted while referenced by products, children, or modules',
    details?: Record<string, unknown>,
  ) {
    super(message, 409, 'CATEGORY_INTEGRITY_CONFLICT', details);
  }
}

export class CategoryCycleConflictError extends AdminError {
  constructor(message = 'Category parent hierarchy contains a cycle or self-reference') {
    super(message, 409, 'CATEGORY_CYCLE_CONFLICT');
  }
}

export class AdminNotFoundError extends AdminError {
  constructor(resource = 'Resource') {
    super(`${resource} not found`, 404, 'NOT_FOUND');
  }
}

export class AdminInvalidInputError extends AdminError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 400, 'INVALID_INPUT', details);
  }
}
