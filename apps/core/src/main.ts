import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigurationError, loadConfig } from './config';
import { configureHttp } from './http/http-foundation';

async function bootstrap() {
  const config = loadConfig();
  const app = await NestFactory.create(AppModule);

  configureHttp(app, config);
  app.enableShutdownHooks();

  await app.listen(config.port, config.host);
  Logger.log(`Core listening at http://${config.host}:${config.port}/api/v1`, 'Bootstrap');
}

void bootstrap().catch((error: unknown) => {
  const detail = error instanceof ConfigurationError
    ? error.message
    : 'Check environment configuration and port availability.';
  Logger.error(`Core failed to start. ${detail}`, 'Bootstrap');
  process.exitCode = 1;
});
