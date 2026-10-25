import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger, ValidationPipe } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import type { AbstractHttpAdapter } from '@nestjs/core';
import { HttpAdapterHost } from '@nestjs/core';
import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { STATUS_CODES } from 'node:http';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

type ApiRequest = IncomingMessage & { requestId?: string; route?: { path?: unknown } };

// Deliberately contains no submitted value, validator target, or exception message.
class InputValidationException extends HttpException {
  constructor() { super('Request validation failed.', 400); }
}

export function createValidationPipe() {
  return new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
    forbidUnknownValues: true,
    transformOptions: { enableImplicitConversion: false },
    validationError: { target: false, value: false },
    exceptionFactory: () => new InputValidationException(),
  });
}

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  constructor(private readonly adapter: AbstractHttpAdapter) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const context = host.switchToHttp();
    const request = context.getRequest<ApiRequest>();
    const response = context.getResponse<ServerResponse>();
    if (response.headersSent) return;
    const parserType = exception !== null && typeof exception === 'object' && 'type' in exception ? exception.type : undefined;
    const statusCode = exception instanceof HttpException ? exception.getStatus()
      : parserType === 'entity.parse.failed' ? 400 : parserType === 'entity.too.large' ? 413 : 500;
    const validation = exception instanceof InputValidationException;
    // Public status text only: ORM errors, SQL, exception causes and request URLs stay private.
    const message = validation ? 'Request validation failed.' : STATUS_CODES[statusCode] ?? 'Request failed.';
    const code = validation ? 'VALIDATION_ERROR' : (STATUS_CODES[statusCode] ?? 'Request failed').toUpperCase().replace(/[^A-Z0-9]+/g, '_');
    response.setHeader('Cache-Control', 'no-store');
    this.adapter.reply(response, { statusCode, code, message, requestId: request.requestId, timestamp: new Date().toISOString() }, statusCode);
  }
}

export function configureHttp(app: INestApplication, config: { origins: string[]; docsEnabled: boolean }) {
  const logger = new Logger('HTTP');
  // Registered before Nest's body parser, so malformed JSON also gets a request ID.
  app.use((request: ApiRequest, response: ServerResponse, next: () => void) => {
    const supplied = request.headers['x-request-id'];
    request.requestId = typeof supplied === 'string' && /^(?:[a-fA-F0-9]{32}|[a-fA-F0-9]{8}(?:-[a-fA-F0-9]{4}){3}-[a-fA-F0-9]{12})$/.test(supplied) ? supplied : randomUUID();
    response.setHeader('X-Request-ID', request.requestId);
    const started = performance.now();
    response.once('finish', () => {
      // Allowlist log fields; never log raw URL/query, body, headers, tokens or errors.
      logger.log(JSON.stringify({ event: 'http.request', requestId: request.requestId,
        method: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'].includes(request.method ?? '') ? request.method : 'OTHER',
        statusCode: response.statusCode, durationMs: Math.round(performance.now() - started) }));
    });
    next();
  });
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(createValidationPipe());
  app.useGlobalFilters(new ApiExceptionFilter(app.get(HttpAdapterHost).httpAdapter));
  app.enableCors({ origin: config.origins, credentials: true,
    methods: ['GET', 'HEAD', 'OPTIONS', 'POST'],
    allowedHeaders: ['Content-Type', 'X-Connection-Check', 'X-Request-ID', 'X-Auth-Request', 'X-CSRF-Token'],
    exposedHeaders: ['X-Request-ID'],
  });
  if (config.docsEnabled) {
    const document = SwaggerModule.createDocument(app, new DocumentBuilder()
      .setTitle('Life Insurance Core API')
      .setDescription('Core API: health and cookie-based login/me/logout. Provisioning remains local-only.')
      .addCookieAuth('li_session', { type: 'apiKey', in: 'cookie' }, 'session')
      .setVersion('0.1.0').build());
    SwaggerModule.setup('api/v1/docs', app, document, {
      jsonDocumentUrl: '/api/v1/docs-json', raw: ['json'],
      swaggerOptions: { persistAuthorization: false },
    });
  }
}
