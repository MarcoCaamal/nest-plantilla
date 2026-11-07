import { z } from 'zod';
import { createZodDto } from '@/shared/infrastructure/http/swagger/zod-dto.helper';

export const UpdateMyProfileDto = createZodDto(z.strictObject({
  displayName: z.string().trim().min(1).max(120).nullable(),
}));
export const ChangeMyPasswordDto = createZodDto(z.strictObject({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(12).max(256),
}));
