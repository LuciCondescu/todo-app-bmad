import { describe, it, expect } from 'vitest';
import { ApiError, isApiError } from './errors.js';

describe('ApiError', () => {
  it('constructs with statusCode + message', () => {
    const err = new ApiError(400, 'Bad Request');
    expect(err.statusCode).toBe(400);
    expect(err.message).toBe('Bad Request');
    expect(err.name).toBe('ApiError');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(ApiError);
  });

  it('is throwable and caught as both Error and ApiError', () => {
    try {
      throw new ApiError(500, 'Internal');
    } catch (e) {
      expect(e).toBeInstanceOf(Error);
      expect(e).toBeInstanceOf(ApiError);
      if (e instanceof ApiError) {
        expect(e.statusCode).toBe(500);
      }
    }
  });
});

describe('isApiError', () => {
  it('returns true for ApiError instances', () => {
    expect(isApiError(new ApiError(400, 'bad'))).toBe(true);
  });
  it('returns false for plain Error', () => {
    expect(isApiError(new Error('plain'))).toBe(false);
  });
  it.each([
    ['string', 'not an error'],
    ['null', null],
    ['undefined', undefined],
    ['number', 42],
    ['plain object with same shape', { statusCode: 400, message: 'x' }],
  ])('returns false for %s', (_label, value) => {
    expect(isApiError(value)).toBe(false);
  });
});
