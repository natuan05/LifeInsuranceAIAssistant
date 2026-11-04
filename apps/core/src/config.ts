import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';

export class ConfigurationError extends Error {}

export function loadConfig() {
  if (existsSync('.env')) {
    loadEnvFile('.env');
  }

  const host = process.env.HOST ?? '127.0.0.1';
  const portValue = process.env.PORT ?? '4000';
  const port = Number(portValue);
  const environment = process.env.NODE_ENV ?? 'development';
  if (!['development', 'test', 'production'].includes(environment)) {
    throw new ConfigurationError('NODE_ENV must be development, test or production.');
  }
  const docsValue = process.env.ENABLE_API_DOCS ?? (environment === 'production' ? 'false' : 'true');
  if (!['true', 'false'].includes(docsValue)) {
    throw new ConfigurationError('ENABLE_API_DOCS must be true or false.');
  }
  if (environment === 'production' && docsValue === 'true') {
    throw new ConfigurationError('API docs must be disabled in production.');
  }

  if (!host.trim()) {
    throw new ConfigurationError('HOST must not be empty.');
  }

  if (!/^\d+$/.test(portValue) || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new ConfigurationError('PORT must be an integer between 1 and 65535.');
  }

  const origins = (process.env.CORS_ORIGINS ?? 'http://localhost:8080,http://127.0.0.1:8080')
    .split(',')
    .map((origin) => origin.trim());

  for (const origin of origins) {
    let url: URL;
    try {
      url = new URL(origin);
    } catch {
      throw new ConfigurationError('CORS_ORIGINS must contain exact HTTP(S) origins separated by commas.');
    }

    if (!['http:', 'https:'].includes(url.protocol) || url.origin !== origin) {
      throw new ConfigurationError('CORS_ORIGINS must not contain wildcards, credentials, paths or trailing slashes.');
    }
  }

  return { host, port, origins, docsEnabled: docsValue === 'true' };
}
