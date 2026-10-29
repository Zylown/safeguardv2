import 'dotenv/config';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { config as loadEnv } from 'dotenv';
import { json, urlencoded } from 'express';
import type { NextFunction, Request, Response } from 'express';
import { toNodeHandler } from 'better-auth/node';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { validateEnvironment } from './config/env.validation';
import { getSafeGuardAuth, isBetterAuthDevelopmentEnabled } from './auth/auth.config';
import { PrismaService } from './prisma/prisma.service';

// Workspace commands run from backend; process environment takes precedence.
loadEnv({ path: '.env' });

async function bootstrap(): Promise<void> {
  const config = validateEnvironment(process.env);
  const app = await NestFactory.create(AppModule, {
    abortOnError: false,
    bodyParser: false,
  });
  const environment = config.NODE_ENV;

  // Express 5 route: leave the original URL and raw request stream intact for Better Auth.
  const expressApp = app.getHttpAdapter().getInstance();
  expressApp.all('/api/auth/*splat', (request: Request, response: Response, next: NextFunction) => {
    if (!isBetterAuthDevelopmentEnabled()) return response.status(404).end();
    void toNodeHandler(getSafeGuardAuth(app.get(PrismaService)))(request, response).catch(next);
  });
  // Other controllers still require Nest's normal JSON and form body semantics.
  app.use(json());
  app.use(urlencoded({ extended: true }));

  app.setGlobalPrefix('api/v1');
  app.enableCors({
    origin: config.WEB_ORIGIN,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: false,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      disableErrorMessages: environment === 'production',
    }),
  );

  if (environment !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('SafeGuard API')
      .setDescription('SafeGuard technical foundation API')
      .setVersion('1.0')
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document);
  }

  app.enableShutdownHooks();
  await app.listen(config.API_PORT, '0.0.0.0');
}

void bootstrap();
