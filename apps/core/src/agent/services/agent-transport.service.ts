import { Injectable } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import type { IncomingMessage } from 'node:http';
import { DatabaseService } from '../../database/database.service';
import {
  Keyring,
  type NonceStore,
  sign,
  validateContract,
  verify,
} from '../hmac';

export type DurableAckDto = {
  outcome: 'ACCEPTED' | 'DUPLICATE' | 'IGNORED_STALE' | 'CONFLICT' | 'REJECTED';
  run_id: string;
  attempt_id: string;
  event_id: string | null;
  reason: string | null;
};

export type RevocationAckDto = {
  outcome: 'REVOKED' | 'ALREADY_REVOKED' | 'REJECTED';
  run_id: string;
  attempt_id: string;
  writer_epoch: number | null;
  reason: string | null;
};

@Injectable()
export class AgentTransportService implements NonceStore {
  constructor(private readonly database: DatabaseService) {}

  get baseUrl(): string {
    return (process.env.AGENT_BASE_URL || 'http://127.0.0.1:8090').replace(/\/+$/, '');
  }

  private loadFileCredential(path: string): string | undefined {
    try {
      const value = readFileSync(path, 'utf8').trim();
      return value || undefined;
    } catch {
      return undefined;
    }
  }

  get outboundKeyring(): Keyring {
    return Keyring.fromEnv(
      'LIFE_AGENT_CORE_TO_AGENT',
      process.env,
      this.loadFileCredential('/credentials/agent_hmac/core_to_agent_key_id'),
      this.loadFileCredential('/credentials/agent_hmac/core_to_agent_keys'),
    );
  }

  get inboundKeyring(): Keyring {
    return Keyring.fromEnv(
      'LIFE_AGENT_AGENT_TO_CORE',
      process.env,
      this.loadFileCredential('/credentials/agent_hmac/agent_to_core_key_id'),
      this.loadFileCredential('/credentials/agent_hmac/agent_to_core_keys'),
    );
  }

  async rememberNonce(keyId: string, nonce: string, windowSeconds: number): Promise<boolean> {
    await this.database.prisma.$executeRaw`
      DELETE FROM business.agent_request_nonces
      WHERE received_at < NOW() - (${windowSeconds} * INTERVAL '1 second')`;
    const inserted = await this.database.prisma.$queryRaw<Array<{ key_id: string }>>`
      INSERT INTO business.agent_request_nonces (key_id, nonce, received_at)
      VALUES (${keyId}, ${nonce}, NOW())
      ON CONFLICT (key_id, nonce) DO NOTHING
      RETURNING key_id`;
    return inserted.length === 1;
  }

  async verifyInbound(
    req: IncomingMessage & { originalUrl?: string },
    rawBody: Buffer,
  ): Promise<string> {
    const method = req.method ?? 'GET';
    const target = req.originalUrl ?? req.url ?? '/';
    return verify(this.inboundKeyring, this, method, target, req.headers, rawBody);
  }

  async dispatchRun(request: Record<string, unknown>, timeoutMs = 10000): Promise<DurableAckDto | null> {
    const target = '/internal/runs';
    const raw = Buffer.from(JSON.stringify(request), 'utf8');
    const headers = {
      'Content-Type': 'application/json',
      ...sign(this.outboundKeyring, 'POST', target, raw),
    };
    try {
      const response = await fetch(`${this.baseUrl}${target}`, {
        method: 'POST',
        headers,
        body: raw,
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (response.status >= 500 || response.status === 401) return null;
      const body = (await response.json()) as unknown;
      const ack = validateContract<DurableAckDto>('DurableAck', body);
      if (ack.run_id !== request.run_id || ack.attempt_id !== request.attempt_id || ack.event_id !== null) {
        return null;
      }
      return ack;
    } catch {
      return null;
    }
  }

  async revokeAttempt(revocation: Record<string, unknown>, timeoutMs = 10000): Promise<RevocationAckDto | null> {
    const attemptId = String(revocation.attempt_id);
    const target = `/internal/attempts/${encodeURIComponent(attemptId)}/revoke`;
    const raw = Buffer.from(JSON.stringify(revocation), 'utf8');
    const headers = {
      'Content-Type': 'application/json',
      ...sign(this.outboundKeyring, 'POST', target, raw),
    };
    try {
      const response = await fetch(`${this.baseUrl}${target}`, {
        method: 'POST',
        headers,
        body: raw,
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (response.status !== 200) return null;
      const body = (await response.json()) as unknown;
      const ack = validateContract<RevocationAckDto>('RevocationAck', body);
      if (
        ack.run_id !== revocation.run_id ||
        ack.attempt_id !== attemptId ||
        !['REVOKED', 'ALREADY_REVOKED'].includes(ack.outcome) ||
        ack.reason !== null ||
        typeof ack.writer_epoch !== 'number' ||
        !Number.isSafeInteger(ack.writer_epoch) ||
        ack.writer_epoch < 0
      ) {
        return null;
      }
      return ack;
    } catch {
      return null;
    }
  }
}
