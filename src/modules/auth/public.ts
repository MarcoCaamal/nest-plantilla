/** Exported entry point for other feature modules and composition roots. */
export { AuthModule } from './auth.module';
export { HumanCredentialVerifierPort } from './application/ports/human-credential-verifier.port';
export { AuthenticateHumanUseCase, type AuthenticateHumanInput } from './application/use-cases/authenticate-human.use-case';
export { HumanAuthenticationGuard } from './infrastructure/http/guards/human-authentication.guard';
