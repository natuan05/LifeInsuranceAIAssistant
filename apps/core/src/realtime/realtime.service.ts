import { Injectable, OnApplicationBootstrap, OnModuleDestroy, UnauthorizedException } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { createHash } from 'node:crypto';
import type { IncomingMessage, Server } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import { AuthService } from '../auth/services/auth.service';
import { DatabaseService } from '../database/database.service';
import { loadConfig } from '../config';
import { Prisma } from '../generated/prisma/client';

type Peer = { request: IncomingMessage; fingerprint: string; actorId: string; busy: boolean; alive: boolean };

@Injectable()
export class RealtimeService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly server = new WebSocketServer({ noServer: true, maxPayload: 1024, perMessageDeflate: false });
  private readonly peers = new Map<WebSocket, Peer>();
  private readonly attempts = new Map<string, { start: number; count: number }>();
  private timer?: NodeJS.Timeout;
  private heartbeat?: NodeJS.Timeout;
  constructor(private readonly adapter: HttpAdapterHost, private readonly auth: AuthService, private readonly database: DatabaseService) {}

  private snapshot(request: IncomingMessage) {
    return this.database.prisma.$transaction(async tx => {
      const { actor } = await this.auth.me(request, tx);
      const data = actor.role === 'STAFF'
        ? await tx.customerProfile.findMany({ where: { assignments: { some: { staffId: actor.id, isActive: true } } },
          orderBy: { userId: 'asc' }, select: { userId: true, fullName: true, birth: true, address: true,
            user: { select: { accountCode: true, email: true, phone: true, status: true } } } })
        : await tx.customerProfile.findUnique({ where: { userId: actor.id }, select: { fullName: true, birth: true, address: true,
          user: { select: { email: true, phone: true, status: true } },
          assignments: { where: { isActive: true }, select: { staffId: true, staff: { select: { fullName: true, department: true,
            user: { select: { email: true, phone: true, status: true, lockedUntil: true } } } } } } } });
      return { actorId: actor.id, fingerprint: createHash('sha256').update(JSON.stringify([actor, data])).digest('hex') };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }

  onApplicationBootstrap() {
    const origins = loadConfig().origins;
    const http = this.adapter.httpAdapter.getHttpServer() as Server;
    http.on('upgrade', (request, socket, head) => {
      if (request.url !== '/api/v1/realtime') { socket.destroy(); return; }
      socket.on('error', () => {});
      if (!origins.includes(request.headers.origin ?? '') || this.peers.size >= 128) { socket.destroy(); return; }
      const now = Date.now();
      for (const [ip, bucket] of this.attempts) if (now - bucket.start > 60000) this.attempts.delete(ip);
      const ip = request.socket.remoteAddress ?? 'unknown';
      const bucket = this.attempts.get(ip) ?? { start: now, count: 0 };
      this.attempts.set(ip, bucket);
      if (++bucket.count > 60 || this.attempts.size > 1024) { socket.destroy(); return; }
      const timeout = setTimeout(() => socket.destroy(), 5000);
      void this.snapshot(request).then(state => {
        clearTimeout(timeout);
        if (socket.destroyed) return;
        if ([...this.peers.values()].filter(p => p.actorId === state.actorId).length >= 4 || this.peers.size >= 128) { socket.destroy(); return; }
        this.server.handleUpgrade(request, socket, head, ws => {
          this.peers.set(ws, { ...state, request, busy: false, alive: true });
          ws.on('error', () => {});
          ws.on('close', () => this.peers.delete(ws));
          ws.on('pong', () => { const peer = this.peers.get(ws); if (peer) peer.alive = true; });
          ws.on('message', () => ws.close(1008, 'Receive-only channel'));
          ws.send(JSON.stringify({ type: 'ready' }));
        });
      }).catch(() => { clearTimeout(timeout); socket.destroy(); });
    });
    // Local baseline: scoped reconciliation every 2s. No business data is sent over the socket.
    this.timer = setInterval(() => {
      for (const [ws, peer] of this.peers) {
        if (peer.busy || ws.readyState !== WebSocket.OPEN) continue;
        peer.busy = true;
        void this.snapshot(peer.request).then(state => {
          if (ws.readyState === WebSocket.OPEN && state.fingerprint !== peer.fingerprint) {
            peer.fingerprint = state.fingerprint;
            ws.send(JSON.stringify({ type: 'invalidate' }));
          }
        }).catch(failure => {
          if (failure instanceof UnauthorizedException) {
            if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'session-expired' }));
            ws.close(4001, 'Session expired');
          } else ws.close(1013, 'Service unavailable');
        }).finally(() => { peer.busy = false; });
      }
    }, 2000);
    this.heartbeat = setInterval(() => {
      for (const [ws, peer] of this.peers) { if (!peer.alive) ws.terminate(); else { peer.alive = false; ws.ping(); } }
    }, 15000);
    this.timer.unref(); this.heartbeat.unref();
  }
  onModuleDestroy() {
    clearInterval(this.timer); clearInterval(this.heartbeat);
    for (const ws of this.peers.keys()) ws.terminate();
    this.server.close();
  }
}
