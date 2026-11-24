import { Controller, Get, Param, Post, Req, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { AuthFailed, ReplayRejected } from '../hmac';
import { AgentAccessService, AgentApiError } from '../services/agent-access.service';
import { AgentRunService } from '../services/agent-run.service';
import { AgentTransportService } from '../services/agent-transport.service';

type RawBodyRequest = IncomingMessage & { rawBody?: Buffer; body?: unknown };

@ApiExcludeController()
@Controller('internal/agent')
export class InternalAgentController {
  constructor(
    private readonly transport: AgentTransportService,
    private readonly access: AgentAccessService,
    private readonly runs: AgentRunService,
  ) {}

  private sendJson(res: ServerResponse, status: number, payload: unknown) {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(JSON.stringify(payload));
  }

  private rawAndParsed(req: RawBodyRequest): { raw: Buffer; body: unknown } {
    if (Buffer.isBuffer(req.rawBody)) {
      return { raw: req.rawBody, body: req.body };
    }
    if (req.body !== undefined && req.body !== null && typeof req.body === 'object' && Object.keys(req.body as object).length > 0) {
      const encoded = Buffer.from(JSON.stringify(req.body), 'utf8');
      return { raw: encoded, body: req.body };
    }
    return { raw: Buffer.alloc(0), body: req.body };
  }

  private queryParams(req: IncomingMessage & { originalUrl?: string }): URLSearchParams {
    const rawUrl = req.originalUrl ?? req.url ?? '/';
    const qIndex = rawUrl.indexOf('?');
    return new URLSearchParams(qIndex >= 0 ? rawUrl.slice(qIndex + 1) : '');
  }

  private getAttemptId(params: URLSearchParams): string {
    return params.get('attemptId') ?? params.get('attempt_id') ?? '';
  }

  private handleError(res: ServerResponse, error: unknown) {
    if (error instanceof ReplayRejected) {
      return this.sendJson(res, 401, { error: { code: error.code } });
    }
    if (error instanceof AuthFailed) {
      return this.sendJson(res, 401, { error: { code: error.code } });
    }
    if (error instanceof AgentApiError) {
      return this.sendJson(res, error.status, { error: { code: error.code } });
    }
    return this.sendJson(res, 500, { error: { code: 'INTERNAL_ERROR' } });
  }

  @Post('events')
  async events(@Req() req: RawBodyRequest, @Res() res: ServerResponse) {
    try {
      const { raw, body } = this.rawAndParsed(req);
      await this.transport.verifyInbound(req, raw);
      const outcome = await this.runs.applyEvent(body);
      return this.sendJson(res, outcome.status, outcome.body);
    } catch (error) {
      return this.handleError(res, error);
    }
  }

  @Get('runs/:runId/history')
  async history(@Param('runId') runId: string, @Req() req: RawBodyRequest, @Res() res: ServerResponse) {
    try {
      const { raw } = this.rawAndParsed(req);
      await this.transport.verifyInbound(req, raw);
      const params = this.queryParams(req);
      const attemptId = this.getAttemptId(params);
      const cursor = params.get('cursor');
      const page = await this.access.history(runId, attemptId, cursor);
      return this.sendJson(res, 200, page);
    } catch (error) {
      return this.handleError(res, error);
    }
  }

  @Get('runs/:runId/linked-history')
  async linkedHistory(@Param('runId') runId: string, @Req() req: RawBodyRequest, @Res() res: ServerResponse) {
    try {
      const { raw } = this.rawAndParsed(req);
      await this.transport.verifyInbound(req, raw);
      const params = this.queryParams(req);
      const attemptId = this.getAttemptId(params);
      const cursor = params.get('cursor');
      const direction = params.get('direction');
      if (direction !== null && direction !== 'backward') {
        return this.sendJson(res, 400, { error: { code: 'INVALID_INPUT' } });
      }
      const page = await this.access.linkedHistory(runId, attemptId, cursor, direction === 'backward');
      return this.sendJson(res, 200, page);
    } catch (error) {
      return this.handleError(res, error);
    }
  }

  @Post('runs/:runId/scope')
  async scope(@Param('runId') runId: string, @Req() req: RawBodyRequest, @Res() res: ServerResponse) {
    try {
      const { raw, body } = this.rawAndParsed(req);
      await this.transport.verifyInbound(req, raw);
      const params = this.queryParams(req);
      const grant = await this.access.scope(runId, body, this.getAttemptId(params));
      return this.sendJson(res, 200, grant);
    } catch (error) {
      return this.handleError(res, error);
    }
  }

  @Get('runs/:runId/contracts')
  async listContracts(@Param('runId') runId: string, @Req() req: RawBodyRequest, @Res() res: ServerResponse) {
    try {
      const { raw } = this.rawAndParsed(req);
      await this.transport.verifyInbound(req, raw);
      const params = this.queryParams(req);
      const attemptId = this.getAttemptId(params);
      const list = await this.access.listContracts(runId, attemptId);
      return this.sendJson(res, 200, list);
    } catch (error) {
      return this.handleError(res, error);
    }
  }

  @Get('runs/:runId/contracts/:policyNumber')
  async getContract(
    @Param('runId') runId: string,
    @Param('policyNumber') policyNumber: string,
    @Req() req: RawBodyRequest,
    @Res() res: ServerResponse,
  ) {
    try {
      const { raw } = this.rawAndParsed(req);
      await this.transport.verifyInbound(req, raw);
      const params = this.queryParams(req);
      const attemptId = this.getAttemptId(params);
      const detail = await this.access.getContractOverview(runId, attemptId, decodeURIComponent(policyNumber));
      return this.sendJson(res, 200, detail);
    } catch (error) {
      return this.handleError(res, error);
    }
  }
}
