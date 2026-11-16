import { Injectable } from '@nestjs/common';
import type { IncomingMessage } from 'node:http';
import { DatabaseService } from '../../database/database.service';
import {
  Keyring,
  type NonceStore,
  sign,
  validateContract,
  verify,
} from '../hmac';

const DEFAULT_C2A_ID = 'local-core-to-agent';
const DEFAULT_C2A_KEYS = 'local-core-to-agent:7WWdWEcjho0hph4XuJ0o3s0EzRYD-lh_osVdT_-Bgs4';
const DEFAULT_A2C_ID = 'local-agent-to-core';
const DEFAULT_A2C_KEYS = 'local-agent-to-core:sCDSorQBg6zoR4Is85YXGlO8BhEzAJgviaA5hucJL7w';

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

  get outboundKeyring(): Keyring {
    return Keyring.fromEnv('LIFE_AGENT_CORE_TO_AGENT', process.env, DEFAULT_C2A_ID, DEFAULT_C2A_KEYS);
  }

  get inboundKeyring(): Keyring {
    return Keyring.fromEnv('LIFE_AGENT_AGENT_TO_CORE', process.env, DEFAULT_A2C_ID, DEFAULT_A2C_KEYS);
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
