import { Body, Controller, HttpCode, Post, Req, UseGuards, UseInterceptors } from '@nestjs/common';
import type { IncomingMessage } from 'node:http';
import { UserAuthenticationGuard } from '../guards/user-authentication.guard';
import { CurrentPrincipal } from '@/shared/infrastructure/http/decorators/current-principal.decorator';
import type { UserPrincipal } from '@/shared/domain/auth/principal';
import { HttpResult } from '@/shared/infrastructure/http/http-result';
import type { DeviceContext } from '../../../application/types';
import { RegisterUseCase } from '../../../application/use-cases/register.use-case';
import { LoginWithPasswordUseCase } from '../../../application/use-cases/loginWithPassword.use-case';
import { RefreshSessionUseCase } from '../../../application/use-cases/refresh-session.use-case';
import { RevokeSessionUseCase } from '../../../application/use-cases/revoke-session.use-case';
import { RequestPasswordResetUseCase } from '../../../application/use-cases/request-password-reset.use-case';
import { ResetPasswordUseCase } from '../../../application/use-cases/reset-password.use-case';
import { VerifyEmailUseCase } from '../../../application/use-cases/verify-email.use-case';
import { RegisterDto, LoginDto, RefreshDto, ForgotPasswordDto, ResetPasswordDto, VerifyEmailDto } from './schemas/auth.schema';
import { AuthFlowErrorMapper } from './auth-error.mapper';
import { Throttle, seconds } from '@nestjs/throttler';
import { AuthThrottlerGuard } from '@/shared/infrastructure/security/auth-throttler.guard';
import { IdempotencyInterceptor } from '@/shared/infrastructure/http/interceptors/idempotency.interceptor';

type DeviceRequest = IncomingMessage & { ip?: string };
function device(request: DeviceRequest): DeviceContext {
  return {
    ...(typeof request.headers['user-agent'] === 'string' ? { userAgent: request.headers['user-agent'] } : {}),
    ...(request.ip ? { ipAddress: request.ip } : {}),
  };
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly registerCase: RegisterUseCase,
    private readonly loginCase: LoginWithPasswordUseCase,
    private readonly refreshCase: RefreshSessionUseCase,
    private readonly revokeCase: RevokeSessionUseCase,
    private readonly requestReset: RequestPasswordResetUseCase,
    private readonly resetCase: ResetPasswordUseCase,
    private readonly verifyCase: VerifyEmailUseCase,
  ) {}

  @Post('register')
  @UseInterceptors(IdempotencyInterceptor)
  async register(@Body({ schema: RegisterDto.schema }) dto: typeof RegisterDto.schema._output) {
    return HttpResult.from(await this.registerCase.execute(dto), AuthFlowErrorMapper.toProblemDetails, 201);
  }

  @Post('login')
  @Throttle({ default: { limit: 5, ttl: seconds(60) } })
  @HttpCode(200)
  @UseGuards(AuthThrottlerGuard)
  async login(@Body({ schema: LoginDto.schema }) dto: typeof LoginDto.schema._output, @Req() request: DeviceRequest) {
    return HttpResult.from(await this.loginCase.execute(dto, device(request)), AuthFlowErrorMapper.toProblemDetails);
  }

  @Post('refresh')
  @Throttle({ default: { limit: 15, ttl: seconds(60) } })
  @HttpCode(200)
  @UseGuards(AuthThrottlerGuard)
  async refresh(@Body({ schema: RefreshDto.schema }) dto: typeof RefreshDto.schema._output, @Req() request: DeviceRequest) {
    return HttpResult.from(await this.refreshCase.execute(dto.refreshToken, device(request)), AuthFlowErrorMapper.toProblemDetails);
  }

  @Post('verify-email')
  @HttpCode(200)
  async verifyEmail(@Body({ schema: VerifyEmailDto.schema }) dto: typeof VerifyEmailDto.schema._output) {
    return HttpResult.from(await this.verifyCase.execute(dto.token), AuthFlowErrorMapper.toProblemDetails);
  }

  @Post('forgot-password')
  @Throttle({ default: { limit: 3, ttl: seconds(60) } })
  @HttpCode(200)
  @UseGuards(AuthThrottlerGuard)
  async forgot(@Body({ schema: ForgotPasswordDto.schema }) dto: typeof ForgotPasswordDto.schema._output) {
    return HttpResult.from(await this.requestReset.execute(dto.email), AuthFlowErrorMapper.toProblemDetails);
  }

  @Post('reset-password')
  @HttpCode(200)
  async reset(@Body({ schema: ResetPasswordDto.schema }) dto: typeof ResetPasswordDto.schema._output) {
    return HttpResult.from(await this.resetCase.execute(dto.token, dto.password), AuthFlowErrorMapper.toProblemDetails);
  }

  @Post('logout')
  @HttpCode(200)
  @UseGuards(UserAuthenticationGuard)
  async logout(@CurrentPrincipal() principal: UserPrincipal) {
    const sessionId = principal.attributes.sessionId;
    if (typeof sessionId !== 'string') throw new Error('Verified principal lacks session identifier');
    return HttpResult.from(await this.revokeCase.execute(principal.id, sessionId), () => ({
      type: 'about:blank', title: 'Unauthorized', status: 401,
    }));
  }

  @Post('logout-all')
  @HttpCode(200)
  @UseGuards(UserAuthenticationGuard)
  async logoutAll(@CurrentPrincipal() principal: UserPrincipal) {
    return HttpResult.from(await this.revokeCase.all(principal.id), () => ({
      type: 'about:blank', title: 'Unauthorized', status: 401,
    }));
  }
}
