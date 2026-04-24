import { describe, it, expect } from 'vitest';
import { FormatRegistry } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';
import { v7 as uuidv7 } from 'uuid';
import { TodoSchema, CreateTodoInputSchema, UpdateTodoInputSchema } from './todo.js';

// TypeBox 0.34's Value.Check fails on unknown formats (it does NOT silently pass
// through as the spec's Dev Notes implied). Register the two formats the schemas
// use so the "accepts well-formed" cases can run without pulling in AJV. Format
// behavior is validated end-to-end by the contract test anyway (AC5), so these
// checkers only need to be permissive enough to match the shape.
FormatRegistry.Set('uuid', (v) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v),
);
FormatRegistry.Set('date-time', (v) => !Number.isNaN(Date.parse(v)));

describe('CreateTodoInputSchema', () => {
  it('rejects empty description', () => {
    expect(Value.Check(CreateTodoInputSchema, { description: '' })).toBe(false);
  });
  it('rejects missing description', () => {
    expect(Value.Check(CreateTodoInputSchema, {})).toBe(false);
  });
  it('rejects description > 500 chars', () => {
    expect(Value.Check(CreateTodoInputSchema, { description: 'x'.repeat(501) })).toBe(false);
  });
  it('rejects unknown keys (additionalProperties: false)', () => {
    expect(Value.Check(CreateTodoInputSchema, { description: 'ok', extra: 'x' })).toBe(false);
  });
  it('accepts a well-formed payload', () => {
    expect(Value.Check(CreateTodoInputSchema, { description: 'Buy milk' })).toBe(true);
  });
  it('accepts description at exactly 500 chars (boundary)', () => {
    expect(Value.Check(CreateTodoInputSchema, { description: 'x'.repeat(500) })).toBe(true);
  });
});

describe('TodoSchema', () => {
  const validTodo = {
    id: uuidv7(),
    description: 'Buy milk',
    completed: false,
    createdAt: '2026-04-20T10:30:00.000Z',
    userId: null,
  };

  it('accepts a well-formed todo with userId: null', () => {
    expect(Value.Check(TodoSchema, validTodo)).toBe(true);
  });
  it('accepts a well-formed todo with userId: string', () => {
    expect(Value.Check(TodoSchema, { ...validTodo, userId: 'growth-user-123' })).toBe(true);
  });
  it('rejects a todo missing id', () => {
    const { id: _id, ...rest } = validTodo;
    expect(Value.Check(TodoSchema, rest)).toBe(false);
  });
  it('rejects a todo missing createdAt', () => {
    const { createdAt: _c, ...rest } = validTodo;
    expect(Value.Check(TodoSchema, rest)).toBe(false);
  });
});

describe('UpdateTodoInputSchema', () => {
  it('rejects missing completed', () => {
    expect(Value.Check(UpdateTodoInputSchema, {})).toBe(false);
  });
  it('rejects non-boolean completed (string)', () => {
    expect(Value.Check(UpdateTodoInputSchema, { completed: 'true' })).toBe(false);
  });
  it('rejects non-boolean completed (number)', () => {
    expect(Value.Check(UpdateTodoInputSchema, { completed: 1 })).toBe(false);
  });
  it('rejects unknown key description (additionalProperties: false)', () => {
    expect(Value.Check(UpdateTodoInputSchema, { completed: true, description: 'x' })).toBe(false);
  });
  it('rejects unknown key id (additionalProperties: false)', () => {
    expect(Value.Check(UpdateTodoInputSchema, { completed: true, id: 'x' })).toBe(false);
  });
  it('accepts { completed: true }', () => {
    expect(Value.Check(UpdateTodoInputSchema, { completed: true })).toBe(true);
  });
  it('accepts { completed: false }', () => {
    expect(Value.Check(UpdateTodoInputSchema, { completed: false })).toBe(true);
  });
});
