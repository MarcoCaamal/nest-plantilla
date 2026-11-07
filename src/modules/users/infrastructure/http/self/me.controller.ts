import { Body, Controller, Get, Patch, Post, UseGuards } from '@nestjs/common';
import { UserAuthenticationGuard } from '@/modules/auth/public';
import { CurrentPrincipal } from '@/shared/infrastructure/http/decorators/current-principal.decorator';
import type { UserPrincipal } from '@/shared/domain/auth/principal';
import { HttpResult } from '@/shared/infrastructure/http/http-result';
import { GetMyProfileUseCase } from '../../../application/use-cases/self/get-my-profile.use-case';
import { UpdateMyProfileUseCase } from '../../../application/use-cases/self/update-my-profile.use-case';
import { ChangeMyPasswordUseCase } from '../../../application/use-cases/self/change-my-password.use-case';
import { UsersErrorMapper } from '../backoffice/users-error.mapper';
import { UpdateMyProfileDto, ChangeMyPasswordDto } from './schemas/me.schema';

/** Self-service routes use a generic UserPrincipal; no backoffice permissions required. */
@Controller('me')
@UseGuards(UserAuthenticationGuard)
export class MeController {
  constructor(private readonly getProfile: GetMyProfileUseCase, private readonly updateProfile: UpdateMyProfileUseCase,
    private readonly changePassword: ChangeMyPasswordUseCase) {}

  @Get()
  async get(@CurrentPrincipal() actor: UserPrincipal) {
    return HttpResult.from(await this.getProfile.execute(actor), UsersErrorMapper.toProblemDetails);
  }

  @Patch()
  async update(@CurrentPrincipal() actor: UserPrincipal,
    @Body({ schema: UpdateMyProfileDto.schema }) dto: typeof UpdateMyProfileDto.schema._output) {
    return HttpResult.from(await this.updateProfile.execute(actor, dto.displayName), UsersErrorMapper.toProblemDetails);
  }

  @Post('change-password')
  async password(@CurrentPrincipal() actor: UserPrincipal,
    @Body({ schema: ChangeMyPasswordDto.schema }) dto: typeof ChangeMyPasswordDto.schema._output) {
    return HttpResult.from(await this.changePassword.execute(actor, dto.currentPassword, dto.newPassword),
      UsersErrorMapper.toProblemDetails);
  }
}
