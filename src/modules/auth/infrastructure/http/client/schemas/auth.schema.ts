import { z } from 'zod';
import { createZodDto } from '@/shared/infrastructure/http/swagger/zod-dto.helper';

const password = z.string().min(12).max(256);
const email = z.email().max(320);

export const RegisterDto = createZodDto(z.object({ email, password }));
export const LoginDto = createZodDto(z.object({ email, password: z.string().min(1) }));
export const RefreshDto = createZodDto(z.object({ refreshToken: z.string().min(32).max(512) }));
export const ForgotPasswordDto = createZodDto(z.object({ email }));
export const ResetPasswordDto = createZodDto(z.object({ token: z.string().min(32), password }));
export const VerifyEmailDto = createZodDto(z.object({ token: z.string().min(32) }));
