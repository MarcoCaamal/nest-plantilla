import { z } from 'zod';

/**
 * A tiny typed schema holder; Nest 12 accepts Standard Schema directly through
 * @Body({ schema: CreateThingDto.schema }) and StandardSchemaValidationPipe.
 * Zod 4.2+ exposes Standard JSON Schema, which Nest Swagger can convert natively.
 * No class-validator, class-transformer, or dependency on DTO classes.
 */
export function createZodDto<TSchema extends z.ZodType>(schema: TSchema) {
  return Object.freeze({
    schema,
    openApiSchema: z.toJSONSchema(schema, { target: 'openapi-3.0', io: 'input' }),
  });
}

export type ZodDtoOutput<TDto extends { schema: z.ZodType }> = z.output<TDto['schema']>;
