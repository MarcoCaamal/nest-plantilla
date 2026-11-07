import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { AppConfig, ConfigModule, EnvironmentValidationError, parseEnv } from '@/shared/infrastructure/config/app-config';
import { baseEnvSchema } from '@/shared/infrastructure/config/env.schema';
import { JsonLogger } from '@/shared/infrastructure/observability/logging/json-logger';

describe('validated environment', () => {
  it('applies safe defaults, coerces PORT, and strips unknown env variables', () => {
    const config = parseEnv({ PORT: '4200', EXTRA_PASSWORD: 'should-not-be-retained' });
    expect(config).toEqual({
      NODE_ENV: 'development',
      PORT: 4200,
      LOG_LEVEL: 'info',
      SERVICE_NAME: 'nest-plantilla',
    });
    const appConfig = new AppConfig(config);
    expect(Object.isFrozen(appConfig.values)).toBe(true);
    expect(appConfig.get('PORT')).toBe(4200);
    expect(Reflect.set(appConfig.values, 'PORT', 23)).toBe(false);
  });

  it('fails fast on unsafe settings without printing environment values', () => {
    for (const [key, value] of [
      ['PORT', 'abc'],
      ['PORT', '0'],
      ['PORT', '65536'],
      ['PORT', '2.5'],
      ['LOG_LEVEL', 'verbose'],
      ['NODE_ENV', 'staging'],
      ['SERVICE_NAME', 'service invalid'],
    ]) {
      expect(() => parseEnv({ [key]: value })).toThrow(EnvironmentValidationError);
      try {
        parseEnv({ [key]: value });
      } catch (error) {
        expect((error as Error).message).toContain(key);
        expect((error as Error).message).not.toContain(value);
      }
    }
  });

  it('supports Zod 4 schema extensions with inferred values', () => {
    const schema = baseEnvSchema.extend({
      FEATURE_ENABLED: z.enum(['true', 'false']).transform((value) => value === 'true'),
      APP_REGION: z.string().min(2),
    });
    const config = parseEnv({ FEATURE_ENABLED: 'true', APP_REGION: 'mx' }, schema);
    expect(config.FEATURE_ENABLED).toBe(true);
    expect(config.APP_REGION).toBe('mx');
    expect(config.PORT).toBe(3000);
  });

  it('registers AppConfig as a dependency-injection token without env reads', async () => {
    const config = new AppConfig(parseEnv({ PORT: '3333' }));
    class TestModule {}
    Module({ imports: [ConfigModule.register(config)] })(TestModule);
    const app = await NestFactory.createApplicationContext(TestModule, { logger: false });
    try {
      expect(app.get(AppConfig)).toBe(config);
      expect(app.get(AppConfig).get('PORT')).toBe(3333);
    } finally {
      await app.close();
    }
  });

  it('allows configuring JSON log levels from the already validated config', () => {
    const lines: string[] = [];
    const logger = new JsonLogger({ writer: (line) => lines.push(line) });
    const config = parseEnv({ LOG_LEVEL: 'warn', SERVICE_NAME: 'catalog-api' });
    logger.configure({
      level: config.LOG_LEVEL,
      service: config.SERVICE_NAME,
    });
    logger.log('hidden');
    logger.warn('visible', 'CatalogModule');
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]!)).toMatchObject({
      level: 'warn',
      service: 'catalog-api',
      context: 'CatalogModule',
    });
  });
});
