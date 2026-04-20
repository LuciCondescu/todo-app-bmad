export class ApiError extends Error {
  readonly statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;

    // Cheap insurance: native ES2022 class extends preserves the prototype chain,
    // but a future target downlevel (ES5) would break `err instanceof ApiError`.
    Object.setPrototypeOf(this, ApiError.prototype);
  }
}

export function isApiError(err: unknown): err is ApiError {
  return err instanceof ApiError;
}
