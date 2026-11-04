const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createServer } = require('node:http');
const { once } = require('node:events');
const { UnauthorizedException } = require('@nestjs/common');
const { WebSocket } = require('ws');
const { RealtimeService } = require('../dist/realtime/realtime.service');

test('receive-only realtime authenticates, isolates scopes, invalidates and revokes sessions', async () => {
  const server = createServer();
  const data = { a: [], b: [] };
  const revoked = new Set();
  const auth = { me: async request => {
    const id = request.headers.cookie;
    if (!['a','b'].includes(id) || revoked.has(id)) throw new UnauthorizedException();
    return { actor: { id, role: 'STAFF' } };
  } };
  const database = { prisma: { $transaction: async fn => fn({ customerProfile: {
    findMany: async query => data[query.where.assignments.some.staffId],
  } }) } };
  const service = new RealtimeService({ httpAdapter: { getHttpServer: () => server } }, auth, database);
  const sockets = [];
  try {
    service.onApplicationBootstrap(); server.listen(0, '127.0.0.1'); await once(server, 'listening');
    const url = `ws://127.0.0.1:${server.address().port}/api/v1/realtime`;
    const connect = async (cookie, origin = 'http://localhost:8080') => {
      const ws = new WebSocket(url, { headers: { cookie, origin } }); sockets.push(ws);
      const events = []; ws.on('message', value => events.push(JSON.parse(String(value))));
      await once(ws, 'open');
      return { ws, events };
    };
    await assert.rejects(connect('a', 'https://untrusted.invalid'));
    await assert.rejects(connect('a', 'http://localhost:3000'));
    await assert.rejects(connect('invalid'));
    const a = await connect('a'); const b = await connect('b');
    const until = async fn => { const end = Date.now() + 7000; while (!fn()) { assert(Date.now() < end, 'event timeout'); await new Promise(r => setTimeout(r, 30)); } };
    await until(() => a.events.length && b.events.length);
    assert.deepEqual(a.events[0], { type: 'ready' });
    data.a = [{ userId: 'synthetic', fullName: 'Synthetic Customer' }];
    await until(() => a.events.some(e => e.type === 'invalidate'));
    assert(!b.events.some(e => e.type === 'invalidate'));
    assert(!JSON.stringify(a.events).includes('Synthetic Customer'));
    revoked.add('a');
    const closed = once(a.ws, 'close');
    const [code] = await closed; assert.equal(code, 4001);
    assert(a.events.some(e => e.type === 'session-expired'));
    const readOnly = once(b.ws, 'close'); b.ws.send('{"type":"write"}');
    assert.equal((await readOnly)[0], 1008);
  } finally {
    for (const ws of sockets) ws.terminate();
    service.onModuleDestroy(); await new Promise(resolve => server.close(resolve));
  }
});
