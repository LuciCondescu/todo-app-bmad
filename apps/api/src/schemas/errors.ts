import { Type, type Static } from '@sinclair/typebox';

export const ErrorResponseSchema = Type.Object(
  {
    statusCode: Type.Integer(),
    error: Type.String(),
    message: Type.String(),
  },
  { $id: 'ErrorResponse', additionalProperties: false },
);

export type ErrorResponse = Static<typeof ErrorResponseSchema>;
