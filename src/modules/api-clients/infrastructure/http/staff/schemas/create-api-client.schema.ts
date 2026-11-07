import { z } from 'zod';
import { createZodDto } from '@/shared/infrastructure/http/swagger/zod-dto.helper';
export const CreateApiClientDto = createZodDto(z.object({
  name: z.string().min(2).max(100),
  permissions: z.array(z.string().regex(/^[a-z][a-z0-9:_-]+:[a-z][a-z0-9:_-]+$/)).max(50).default([]),
  scopes: z.array(z.string().min(1).max(120)).max(50).default([]),
}));
