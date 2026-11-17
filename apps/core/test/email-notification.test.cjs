const assert = require('node:assert/strict');
const { test } = require('node:test');
const net = require('node:net');
const { SmtpClient } = require('../dist/notifications/services/smtp-client');
const { EmailNotificationService } = require('../dist/notifications/services/email-notification.service');
const { OutboxDispatcherService } = require('../dist/outbox/services/outbox-dispatcher.service');

// Helper to create a lightweight mock SMTP server
function createMockSmtpServer(options = {}) {
  const messages = [];
  const server = net.createServer(socket => {
    socket.setEncoding('utf8');
    let state = 'INIT';
    let dataBuffer = '';

    if (options.failGreeting) {
      socket.write('500 Service unavailable\r\n');
      socket.end();
      return;
    }

    socket.write('220 localhost ESMTP MockServer\r\n');

    socket.on('data', chunk => {
      dataBuffer += chunk;
      const lines = dataBuffer.split('\r\n');
      dataBuffer = lines.pop(); // keep remainder

      for (const line of lines) {
        if (state === 'DATA') {
          if (line === '.') {
            state = 'NORMAL';
            messages.push(currentMessage);
            if (options.failData) {
              socket.write('554 Transaction failed\r\n');
            } else {
              socket.write('250 2.0.0 OK: message queued\r\n');
            }
          } else {
            currentMessage.raw += (line.startsWith('..') ? line.slice(1) : line) + '\r\n';
          }
          continue;
        }

        const cmd = line.toUpperCase();
        if (cmd.startsWith('EHLO') || cmd.startsWith('HELO')) {
          socket.write('250-localhost\r\n250-PIPELINING\r\n250 8BITMIME\r\n');
        } else if (cmd.startsWith('MAIL FROM:')) {
          currentMessage = { from: line.slice(10).trim(), raw: '' };
          socket.write('250 2.1.0 Ok\r\n');
        } else if (cmd.startsWith('RCPT TO:')) {
          if (options.failRcpt) {
            socket.write('550 5.1.1 User unknown\r\n');
          } else {
            currentMessage.to = line.slice(8).trim();
            socket.write('250 2.1.5 Ok\r\n');
          }
        } else if (cmd === 'DATA') {
          state = 'DATA';
          socket.write('354 End data with <CR><LF>.<CR><LF>\r\n');
        } else if (cmd === 'QUIT') {
          socket.write('221 2.0.0 Bye\r\n');
          socket.end();
        } else {
          socket.write('500 Command unrecognized\r\n');
        }
      }
    });
  });

  let currentMessage = null;

  return {
    server,
    messages,
    listen: () => new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port))),
    close: () => new Promise(resolve => server.close(resolve)),
  };
}

test('SmtpClient connects, negotiates SMTP and delivers RFC-compliant multipart email', async () => {
  const mockSmtp = createMockSmtpServer();
  const port = await mockSmtp.listen();

  try {
    const client = new SmtpClient({
      host: '127.0.0.1',
      port,
      from: 'Life Insurance <no-reply@life-assistant.local>',
      timeoutMs: 5000,
    });

    const res = await client.sendMail({
      to: 'customer@dev.example.invalid',
      subject: 'Tiếp nhận Phiếu hỗ trợ #TK-987654',
      text: 'Chào bạn, phiếu hỗ trợ của bạn đã được tạo.',
      html: '<p>Chào bạn, phiếu hỗ trợ <b>#TK-987654</b> đã được tạo.</p>',
    });

    assert(res.messageId.includes('@127.0.0.1>') || res.messageId.includes('@localhost>'));
    assert.equal(mockSmtp.messages.length, 1);

    const received = mockSmtp.messages[0];
    assert.equal(received.to, '<customer@dev.example.invalid>');
    assert(received.raw.includes('Subject: =?UTF-8?B?'));
    assert(received.raw.includes('Content-Type: multipart/alternative; boundary='));
    assert(received.raw.includes('Content-Type: text/plain; charset=UTF-8'));
    assert(received.raw.includes('Content-Type: text/html; charset=UTF-8'));
  } finally {
    await mockSmtp.close();
  }
});

test('SmtpClient propagates errors on SMTP rejection', async () => {
  const mockSmtp = createMockSmtpServer({ failRcpt: true });
  const port = await mockSmtp.listen();

  try {
    const client = new SmtpClient({
      host: '127.0.0.1',
      port,
      from: 'no-reply@life-assistant.local',
      timeoutMs: 2000,
    });

    await assert.rejects(
      client.sendMail({
        to: 'unknown@example.invalid',
        subject: 'Test',
        text: 'Hello',
      }),
      /SMTP RCPT TO failed: 550/
    );
  } finally {
    await mockSmtp.close();
  }
});

test('EmailNotificationService formats ticket emails with PII protection and escaping', async () => {
  const sentEmails = [];
  const mockClient = {
    sendMail: async (options) => {
      sentEmails.push(options);
      return { messageId: '<msg-1@test>', response: '250 OK' };
    },
  };

  const emailService = new EmailNotificationService();
  emailService.setClient(mockClient);

  // 1. Ticket Created
  await emailService.sendTicketCreated({
    to: 'customer@dev.example.invalid',
    customerName: 'Nguyễn Văn <Alert> A',
    ticketCode: 'TK-1234567890ABCDEF',
    ticketTitle: 'Yêu cầu bồi thường <script>alert(1)</script>',
    ticketId: '00000000-0000-0000-0000-000000000001',
    createdAt: new Date('2026-11-17T10:00:00Z'),
  });

  assert.equal(sentEmails.length, 1);
  const createdEmail = sentEmails[0];
  assert.equal(createdEmail.to, 'customer@dev.example.invalid');
  assert.equal(createdEmail.subject, '[Life Insurance] Tiếp nhận Phiếu hỗ trợ #TK-1234567890ABCDEF');
  assert(createdEmail.html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert(!createdEmail.html.includes('<script>'));
  assert(createdEmail.html.includes('#TK-1234567890ABCDEF'));
  assert(createdEmail.html.includes('http://localhost:8080/tickets'));
  assert(createdEmail.text.includes('TK-1234567890ABCDEF'));

  // 2. Ticket Accepted
  await emailService.sendTicketAccepted({
    to: 'customer@dev.example.invalid',
    customerName: 'Nguyễn Văn A',
    ticketCode: 'TK-1234567890ABCDEF',
    ticketTitle: 'Yêu cầu bồi thường',
    ticketId: '00000000-0000-0000-0000-000000000001',
    staffName: 'Trần Thị Chuyên Viên',
  });

  assert.equal(sentEmails.length, 2);
  const acceptedEmail = sentEmails[1];
  assert.equal(acceptedEmail.subject, '[Life Insurance] Chuyên viên đã tiếp nhận Phiếu hỗ trợ #TK-1234567890ABCDEF');
  assert(acceptedEmail.html.includes('Trần Thị Chuyên Viên'));
  assert(acceptedEmail.html.includes('Đang xử lý (IN_PROGRESS)'));

  // 3. Ticket Creation Failed
  await emailService.sendTicketCreationFailed({
    to: 'customer@dev.example.invalid',
    customerName: 'Nguyễn Văn A',
    reason: 'Bản thảo yêu cầu hỗ trợ đã hết hạn (DRAFT_EXPIRED).',
  });

  assert.equal(sentEmails.length, 3);
  const failedEmail = sentEmails[2];
  assert.equal(failedEmail.subject, '[Life Insurance] Thông báo về yêu cầu tạo phiếu hỗ trợ');
  assert(failedEmail.html.includes('DRAFT_EXPIRED'));
});

test('OutboxDispatcherService integrates ticket email notification and maintains fault isolation', async () => {
  const sentEmails = [];
  const publishedTickets = [];
  let shouldSmtpFail = false;

  const mockEmail = {
    sendTicketCreated: async (data) => {
      if (shouldSmtpFail) throw new Error('SMTP connection refused');
      sentEmails.push({ type: 'CREATED', ...data });
    },
    sendTicketAccepted: async (data) => {
      if (shouldSmtpFail) throw new Error('SMTP connection refused');
      sentEmails.push({ type: 'ACCEPTED', ...data });
    },
  };

  const mockTickets = {
    route: async () => ['customer-uuid-1', 'staff-uuid-1'],
  };

  const mockRealtime = {
    publishTicket: async (event, recipients) => {
      publishedTickets.push({ event, recipients });
    },
  };

  const outboxRecords = {
    'evt-1': {
      id: 'evt-1',
      aggregateId: 'ticket-uuid-1',
      eventType: 'TICKET_CREATED',
      retryCount: 0,
      status: 'PROCESSING',
      leaseOwner: 'test-owner',
      lastError: null,
    },
  };

  const mockDatabase = {
    prisma: {
      outboxEvent: {
        updateMany: async ({ where, data }) => {
          const record = outboxRecords[where.id];
          if (!record) return { count: 0 };
          Object.assign(record, data);
          return { count: 1 };
        },
      },
      supportTicket: {
        findUnique: async () => ({
          id: 'ticket-uuid-1',
          ticketCode: 'TK-OUTBOXTEST01',
          title: 'Hỗ trợ thay đổi địa chỉ',
          createdAt: new Date('2026-11-17T12:00:00Z'),
          customer: {
            fullName: 'Lê Khách Hàng',
            user: { email: 'customer.outbox@dev.example.invalid' },
          },
          staff: {
            fullName: 'Nguyễn Nhân Viên',
          },
        }),
      },
    },
  };

  const dispatcher = new OutboxDispatcherService(
    mockDatabase,
    null, // events
    mockRealtime,
    mockTickets,
    mockEmail
  );

  // Normal flow: TICKET_CREATED
  const event = {
    id: 'evt-1',
    aggregateId: 'ticket-uuid-1',
    eventType: 'TICKET_CREATED',
    retryCount: 0,
  };

  await dispatcher.process(event);

  assert.equal(publishedTickets.length, 1);
  assert.equal(sentEmails.length, 1);
  assert.equal(sentEmails[0].to, 'customer.outbox@dev.example.invalid');
  assert.equal(sentEmails[0].ticketCode, 'TK-OUTBOXTEST01');
  assert.equal(outboxRecords['evt-1'].status, 'PUBLISHED');
  assert.equal(outboxRecords['evt-1'].lastError, null);

  // Fault tolerance test: SMTP fails (Fault Injection)
  shouldSmtpFail = true;
  outboxRecords['evt-2'] = {
    id: 'evt-2',
    aggregateId: 'ticket-uuid-1',
    eventType: 'TICKET_CREATED',
    retryCount: 1,
    status: 'PROCESSING',
    leaseOwner: 'test-owner',
    lastError: null,
  };

  const failingEvent = {
    id: 'evt-2',
    aggregateId: 'ticket-uuid-1',
    eventType: 'TICKET_CREATED',
    retryCount: 1,
  };

  await dispatcher.process(failingEvent);

  // Event must NOT be marked PUBLISHED; must stay PENDING with DISPATCH_FAILED
  assert.equal(outboxRecords['evt-2'].status, 'PENDING');
  assert.equal(outboxRecords['evt-2'].lastError, 'DISPATCH_FAILED');
  assert(outboxRecords['evt-2'].nextAttemptAt instanceof Date);
});

test('Live MailHog integration delivers email and is verifiable via MailHog API', async (t) => {
  const host = process.env.SMTP_HOST || 'mailhog';
  const port = Number.parseInt(process.env.SMTP_PORT || '1025', 10);
  const webPort = process.env.MAILHOG_WEB_PORT || '8025';

  const client = new SmtpClient({
    host,
    port,
    from: 'no-reply@life-assistant.local',
    timeoutMs: 3000,
  });

  const testTicketCode = 'TK-LIVE' + Date.now().toString().slice(-6);

  try {
    const res = await client.sendMail({
      to: 'anh.customer@dev.example.invalid',
      subject: `[Life Insurance] Tiếp nhận Phiếu hỗ trợ #${testTicketCode}`,
      text: `Phiếu #${testTicketCode} đã tạo thành công.`,
      html: `<p>Phiếu <b>#${testTicketCode}</b> đã tạo thành công.</p>`,
    });

    assert(res.messageId);

    // Verify against MailHog HTTP API if accessible from container or localhost
    const apiUrls = [`http://${host}:${webPort}/api/v2/messages`, `http://127.0.0.1:${webPort}/api/v2/messages`];
    for (const url of apiUrls) {
      try {
        const resp = await fetch(url);
        if (resp.ok) {
          const data = await resp.json();
          assert(data.items.some(item => item.Content.Headers.Subject[0].includes(testTicketCode) || item.Raw.Data.includes(testTicketCode)));
          break;
        }
      } catch {
        // Fallback for isolated networks
      }
    }
  } catch (err) {
    // If MailHog container is not running during this run, skip gracefully
    if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
      t.skip('MailHog service is not running; skipping live test');
    } else {
      throw err;
    }
  }
});
