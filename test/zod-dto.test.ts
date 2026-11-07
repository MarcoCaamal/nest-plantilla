import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createZodDto } from '@/shared/infrastructure/http/swagger/zod-dto.helper';

describe('createZodDto', () => {
  it('preserves Standard Schema and OpenAPI 3.0 metadata', () => {
    const CreateDto = createZodDto(z.object({
      name: z.string().min(2).meta({ description: 'Display name' }),
    }).meta({ title: 'CreateDto' }));
    expect(CreateDto.schema['~standard'].vendor).toBe('zod');
    expect(CreateDto.schema.safeParse({ name: 'A' }).success).toBe(false);
    expect(CreateDto.openApiSchema).toMatchObject({ type: 'object' });
  });
});
