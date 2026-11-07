export interface AuthTokens {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly tokenType: 'Bearer';
  readonly expiresIn: number;
}
export interface DeviceContext {
  readonly userAgent?: string;
  readonly ipAddress?: string;
}
