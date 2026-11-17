import * as net from 'node:net';
import * as tls from 'node:tls';

export interface SmtpConfig {
  host: string;
  port: number;
  secure?: boolean;
  user?: string;
  pass?: string;
  from: string;
  timeoutMs?: number;
}

export interface SendMailOptions {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export class SmtpClient {
  private readonly config: SmtpConfig;
  constructor(config: SmtpConfig) {
    this.config = config;
  }

  async sendMail(options: SendMailOptions): Promise<{ messageId: string; response: string }> {
    const timeout = this.config.timeoutMs ?? 10000;
    const socket = await this.createConnection(timeout);

    try {
      // 1. Read greeting (220)
      const greeting = await this.readResponse(socket, timeout);
      if (!greeting.startsWith('220')) {
        throw new Error(`SMTP Greeting failed: ${greeting}`);
      }

      // 2. Send EHLO
      const ehloResp = await this.sendCommand(socket, 'EHLO localhost', timeout);
      if (!ehloResp.startsWith('250')) {
        throw new Error(`SMTP EHLO failed: ${ehloResp}`);
      }

      // 3. Authenticate if user & pass provided
      if (this.config.user && this.config.pass) {
        const authResp = await this.sendCommand(socket, 'AUTH LOGIN', timeout);
        if (!authResp.startsWith('334')) {
          throw new Error(`SMTP AUTH LOGIN failed: ${authResp}`);
        }
        const userB64 = Buffer.from(this.config.user).toString('base64');
        const userResp = await this.sendCommand(socket, userB64, timeout);
        if (!userResp.startsWith('334')) {
          throw new Error(`SMTP Username failed: ${userResp}`);
        }
        const passB64 = Buffer.from(this.config.pass).toString('base64');
        const passResp = await this.sendCommand(socket, passB64, timeout);
        if (!passResp.startsWith('235')) {
          throw new Error(`SMTP Authentication failed: ${passResp}`);
        }
      }

      // Extract sender address from e.g. "Name <email@domain>"
      const fromAddr = this.extractEmail(this.config.from);
      const toAddr = this.extractEmail(options.to);

      // 4. MAIL FROM
      const mailFromResp = await this.sendCommand(socket, `MAIL FROM:<${fromAddr}>`, timeout);
      if (!mailFromResp.startsWith('250')) {
        throw new Error(`SMTP MAIL FROM failed: ${mailFromResp}`);
      }

      // 5. RCPT TO
      const rcptResp = await this.sendCommand(socket, `RCPT TO:<${toAddr}>`, timeout);
      if (!rcptResp.startsWith('250')) {
        throw new Error(`SMTP RCPT TO failed: ${rcptResp}`);
      }

      // 6. DATA
      const dataResp = await this.sendCommand(socket, 'DATA', timeout);
      if (!dataResp.startsWith('354')) {
        throw new Error(`SMTP DATA failed: ${dataResp}`);
      }

      // 7. Send message content
      const messageId = `<${Date.now()}.${Math.random().toString(36).substring(2, 10)}@${this.config.host}>`;
      const mimeMessage = this.buildMimeMessage({
        from: this.config.from,
        to: options.to,
        subject: options.subject,
        text: options.text,
        html: options.html,
        messageId,
      });

      const sendResp = await this.sendCommand(socket, `${mimeMessage}\r\n.`, timeout);
      if (!sendResp.startsWith('250')) {
        throw new Error(`SMTP Message delivery failed: ${sendResp}`);
      }

      // 8. QUIT
      try {
        await this.sendCommand(socket, 'QUIT', 3000);
      } catch {
        // Ignore quit errors if delivery succeeded
      }

      return { messageId, response: sendResp };
    } finally {
      socket.destroy();
    }
  }

  private createConnection(timeout: number): Promise<net.Socket | tls.TLSSocket> {
    return new Promise((resolve, reject) => {
      let settled = false;
      const onError = (err: Error) => {
        if (!settled) {
          settled = true;
          reject(err);
        }
      };

      const socket = this.config.secure
        ? tls.connect({
            host: this.config.host,
            port: this.config.port,
            rejectUnauthorized: false,
          })
        : net.connect({
            host: this.config.host,
            port: this.config.port,
          });

      socket.setTimeout(timeout, () => {
        onError(new Error(`SMTP Connection timeout (${timeout}ms) to ${this.config.host}:${this.config.port}`));
        socket.destroy();
      });

      socket.once('error', onError);
      socket.once('connect', () => {
        if (!settled) {
          settled = true;
          resolve(socket);
        }
      });
      // In case TLS emits secureConnect
      if ('secureConnect' in socket) {
        socket.once('secureConnect', () => {
          if (!settled) {
            settled = true;
            resolve(socket);
          }
        });
      }
    });
  }

  private sendCommand(socket: net.Socket, cmd: string, timeout: number): Promise<string> {
    return new Promise((resolve, reject) => {
      socket.write(`${cmd}\r\n`, 'utf8', (err) => {
        if (err) return reject(err);
        this.readResponse(socket, timeout).then(resolve, reject);
      });
    });
  }

  private readResponse(socket: net.Socket, timeout: number): Promise<string> {
    return new Promise((resolve, reject) => {
      let buffer = '';
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error(`SMTP response timeout (${timeout}ms)`));
      }, timeout);

      const onData = (chunk: Buffer) => {
        buffer += chunk.toString('utf8');
        // Multiline responses have hyphen after code, final line has space e.g. "250 OK" or "250-SIZE\r\n250 OK"
        const lines = buffer.split('\r\n').filter(Boolean);
        const lastLine = lines[lines.length - 1];
        if (lastLine && /^\d{3} /.test(lastLine)) {
          cleanup();
          resolve(buffer.trim());
        }
      };

      const onError = (err: Error) => {
        cleanup();
        reject(err);
      };

      const onClose = () => {
        cleanup();
        if (buffer) {
          resolve(buffer.trim());
        } else {
          reject(new Error('SMTP socket closed unexpectedly'));
        }
      };

      const cleanup = () => {
        clearTimeout(timer);
        socket.off('data', onData);
        socket.off('error', onError);
        socket.off('close', onClose);
      };

      socket.on('data', onData);
      socket.once('error', onError);
      socket.once('close', onClose);
    });
  }

  private extractEmail(addr: string): string {
    const match = addr.match(/<([^>]+)>/);
    return match ? match[1].trim() : addr.trim();
  }

  private encodeWord(str: string): string {
    return `=?UTF-8?B?${Buffer.from(str, 'utf8').toString('base64')}?=`;
  }

  private buildMimeMessage(data: {
    from: string;
    to: string;
    subject: string;
    text: string;
    html?: string;
    messageId: string;
  }): string {
    const dateStr = new Date().toUTCString();
    const encodedSubject = this.encodeWord(data.subject);

    if (!data.html) {
      return [
        `Date: ${dateStr}`,
        `From: ${data.from}`,
        `To: ${data.to}`,
        `Message-ID: ${data.messageId}`,
        `Subject: ${encodedSubject}`,
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset=UTF-8',
        'Content-Transfer-Encoding: base64',
        '',
        Buffer.from(data.text, 'utf8').toString('base64'),
      ].join('\r\n');
    }

    const boundary = `----=_Part_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
    return [
      `Date: ${dateStr}`,
      `From: ${data.from}`,
      `To: ${data.to}`,
      `Message-ID: ${data.messageId}`,
      `Subject: ${encodedSubject}`,
      'MIME-Version: 1.0',
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      '',
      `--${boundary}`,
      'Content-Type: text/plain; charset=UTF-8',
      'Content-Transfer-Encoding: base64',
      '',
      Buffer.from(data.text, 'utf8').toString('base64'),
      '',
      `--${boundary}`,
      'Content-Type: text/html; charset=UTF-8',
      'Content-Transfer-Encoding: base64',
      '',
      Buffer.from(data.html, 'utf8').toString('base64'),
      '',
      `--${boundary}--`,
    ].join('\r\n');
  }
}
