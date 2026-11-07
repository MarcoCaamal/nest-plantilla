import { z } from 'zod';
import { createZodDto } from '@/shared/infrastructure/http/swagger/zod-dto.helper';
import { PageQueryDto } from '@/shared/infrastructure/http/schemas/pagination-query.schema';

export const UsersQueryDto = createZodDto(PageQueryDto.schema.extend({
  email: z.string().max(320).optional(),
}));
export const AssignRoleDto = createZodDto(z.strictObject({
  roleKey: z.string().min(2).max(100),
}));
export const CreateUserDto = createZodDto(z.strictObject({
  email: z.email().max(320),
  password: z.string().min(12).max(256),
  displayName: z.string().trim().min(1).max(120).optional(),
}));
export const ChangeUserStatusDto = createZodDto(z.strictObject({
  status: z.enum(['ACTIVE', 'SUSPENDED']),
}));
