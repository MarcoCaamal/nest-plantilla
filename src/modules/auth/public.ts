/** Exported entry point for other feature modules and composition roots. */
export { AuthModule } from './auth.module';
export { UserCredentialVerifierPort } from './application/ports/user-credential-verifier.port';
export { AuthenticateUserUseCase, type AuthenticateUserInput } from './application/use-cases/authenticate-user.use-case';
export { UserAuthenticationGuard } from './infrastructure/http/guards/user-authentication.guard';
export { PasswordHasherPort } from './application/ports/password-hasher.port';
export { SessionRepositoryPort } from './application/ports/session-repository.port';
