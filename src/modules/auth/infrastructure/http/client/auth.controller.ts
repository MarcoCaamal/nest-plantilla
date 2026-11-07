import {
  Body, Controller, Get, HttpCode, Post, Req, UseGuards,
} from '@nestjs/common';
import type { IncomingMessage } from 'node:http';
import { UserAuthenticationGuard } from '../guards/user-authentication.guard';
import { CurrentPrincipal } from '@/shared/infrastructure/http/decorators/current-principal.decorator';
import type { UserPrincipal } from '@/shared/domain/auth/principal';
import { HttpResult } from '@/shared/infrastructure/http/http-result';
import { AuthFlows, type DeviceContext } from '../../../application/auth-flows';
import {
  RegisterDto, LoginDto, RefreshDto, ForgotPasswordDto, ResetPasswordDto, VerifyEmailDto,
} from './schemas/auth.schema';
import { AuthFlowErrorMapper } from './auth-error.mapper';
import { Throttle, seconds } from '@nestjs/throttler';
import { AuthThrottlerGuard } from '@/shared/infrastructure/security/auth-throttler.guard';
import { IdempotencyInterceptor } from '@/shared/infrastructure/http/interceptors/idempotency.interceptor';
import { UseInterceptors } from '@nestjs/common';

type DeviceRequest = IncomingMessage & { ip?: string };
function device(request: DeviceRequest): DeviceContext {
  return {
    ...(typeof request.headers['user-agent'] === 'string'
      ? { userAgent: request.headers['user-agent'] } : {}),
    ...(request.ip ? { ipAddress: request.ip } : {}),
  };
}

@Controller('auth')
export class AuthController {
  constructor(private readonly flows: AuthFlows) {}

  @Post('register')
  @UseInterceptors(IdempotencyInterceptor)
  async register(@Body({ schema: RegisterDto.schema }) dto: typeof RegisterDto.schema._output) {
    return HttpResult.from(await this.flows.register(dto), AuthFlowErrorMapper.toProblemDetails, 201);
  }

  @Post('login')
  @Throttle({ default: { limit: 5, ttl: seconds(60) } })
  @HttpCode(200)
  @UseGuards(AuthThrottlerGuard)
  async login(@Body({ schema: LoginDto.schema }) dto: typeof LoginDto.schema._output, @Req() request: DeviceRequest) {
    return HttpResult.from(await this.flows.login(dto, device(request)), AuthFlowErrorMapper.toProblemDetails);
  }

  @Post('refresh')
  @Throttle({ default: { limit: 15, ttl: seconds(60) } })
  @HttpCode(200)
  @UseGuards(AuthThrottlerGuard)
  async refresh(@Body({ schema: RefreshDto.schema }) dto: typeof RefreshDto.schema._output, @Req() request: DeviceRequest) {
    return HttpResult.from(await this.flows.refresh(dto.refreshToken, device(request)), AuthFlowErrorMapper.toProblemDetails);
  }

  @Post('verify-email')
  @HttpCode(200)
  async verifyEmail(@Body({ schema: VerifyEmailDto.schema }) dto: typeof VerifyEmailDto.schema._output) {
    return HttpResult.from(await this.flows.verifyEmail(dto.token), AuthFlowErrorMapper.toProblemDetails);
  }

  @Post('forgot-password')
  @Throttle({ default: { limit: 3, ttl: seconds(60) } })
  @HttpCode(200)
  @UseGuards(AuthThrottlerGuard)
  async forgot(@Body({ schema: ForgotPasswordDto.schema }) dto: typeof ForgotPasswordDto.schema._output) {
    return HttpResult.from(await this.flows.forgotPassword(dto.email), AuthFlowErrorMapper.toProblemDetails);
  }

  @Post('reset-password')
  @HttpCode(200)
  async reset(@Body({ schema: ResetPasswordDto.schema }) dto: typeof ResetPasswordDto.schema._output) {
    return HttpResult.from(await this.flows.resetPassword(dto.token, dto.password), AuthFlowErrorMapper.toProblemDetails);
  }

  @Post('logout')
  @HttpCode(200)
  @UseGuards(UserAuthenticationGuard)
  async logout(@CurrentPrincipal() principal: UserPrincipal) {
    const sessionId = principal.attributes.sessionId;
    if (typeof sessionId !== 'string') throw new Error('Verified principal lacks session identifier');
    return HttpResult.from(await this.flows.logout(principal.id, sessionId), () => ({
      type: 'about:blank', title: 'Unauthorized', status: 401,
    }));
  }

  @Post('logout-all')
  @HttpCode(200)
  @UseGuards(UserAuthenticationGuard)
  async logoutAll(@CurrentPrincipal() principal: UserPrincipal) {
    return HttpResult.from(await this.flows.logoutAll(principal.id), () => ({
      type: 'about:blank', title: 'Unauthorized', status: 401,
    }));
  }

  @Get('me')
  @UseGuards(UserAuthenticationGuard)
  me(@CurrentPrincipal() principal: UserPrincipal) {
    return { id: principal.id, type: principal.type, roles: principal.roles, permissions: principal.permissions };
  }
}
