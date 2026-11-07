import { z } from 'zod';
import { createZodDto } from '@/shared/infrastructure/http/swagger/zod-dto.helper';
import { PageQueryDto } from '@/shared/infrastructure/http/schemas/pagination-query.schema';

export const UsersQueryDto = createZodDto(PageQueryDto.schema.extend({
  email: z.string().max(320).optional(),
}));
export const CreateRoleDto = createZodDto(z.object({
  key: z.string().regex(/^[a-z][a-z0-9:_-]{1,80}$/),
  name: z.string().min(2).max(100),
  description: z.string().max(500).optional(),
}));
export const UpdateRoleDto = createZodDto(z.strictObject({
  name: z.string().min(2).max(100).optional(),
  description: z.string().max(500).nullable().optional(),
}).refine((value) => value.name !== undefined || value.description !== undefined, {
  message: 'At least one editable property is required',
}));
export const AssignRoleDto = createZodDto(z.object({ roleKey: z.string().min(2).max(100) }));
export const GrantPermissionDto = createZodDto(z.object({ permissionKey: z.string().min(2).max(100) }));
