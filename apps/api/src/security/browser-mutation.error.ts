export class BrowserMutationSecurityError extends Error {
  constructor(
    public readonly status: 400 | 403 | 413 | 415,
    public readonly code:
      | 'browser-origin-denied'
      | 'mutation-media-type-unsupported'
      | 'mutation-method-override-denied'
      | 'mutation-body-too-large',
    public readonly title: string,
    public readonly detail: string,
  ) {
    super(code);
  }
}

export function sendBrowserMutationProblem(
  response: {
    status(value: number): { type(value: string): { json(value: unknown): unknown } };
  },
  error: BrowserMutationSecurityError,
): void {
  response
    .status(error.status)
    .type('application/problem+json')
    .json({
      type: `https://shopee-clone.local/problems/${error.code}`,
      title: error.title,
      status: error.status,
      detail: error.detail,
    });
}
