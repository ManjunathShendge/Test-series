import { Body, Controller, Get, Headers, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import {
  ATTEMPT_SESSION_HEADER,
  StartAttemptRequest,
  SyncAttemptRequest,
  type AssetViewUrl,
  type AttemptPaper,
  type AttemptSession,
  type AttemptState,
  type AttemptSummary,
  type MyAttemptList,
  type SyncAttemptResponse,
} from '@exam-prep/contracts';
import { FirebaseAuthGuard } from '../../../common/guards/firebase-auth.guard.js';
import { parseContract } from '../../../common/pipes/parse-contract.js';
import type { AccessContext } from '../../identity/application/identity.service.js';
import { CurrentAccess, RolesGuard } from '../../identity/http/roles.guard.js';
import { AttemptsService } from '../application/attempts.service.js';

const Id = z.uuid();
const Token = z.string().regex(/^[A-Za-z0-9_-]{43}$/).optional();

/** Student attempts (PRD 6.4). Signed in, unblocked, on a registered device. */
@Controller()
@UseGuards(FirebaseAuthGuard, RolesGuard)
export class AttemptsController {
  constructor(private readonly service: AttemptsService) {}

  @Post('attempts')
  start(@CurrentAccess() access: AccessContext, @Body() body: unknown): Promise<AttemptSession | { attemptId: string; resume: true }> {
    return this.service.start(access, parseContract(StartAttemptRequest, body).testId);
  }

  @Get('me/attempts')
  mine(@CurrentAccess() access: AccessContext): Promise<MyAttemptList> {
    return this.service.mine(access);
  }

  @Get('attempts/:id')
  get(
    @CurrentAccess() access: AccessContext,
    @Param('id') id: string,
    @Headers(ATTEMPT_SESSION_HEADER) token: string | undefined,
  ): Promise<AttemptState> {
    return this.service.get(access, parseContract(Id, id), parseContract(Token, token));
  }

  @Post('attempts/:id/takeover')
  @HttpCode(200)
  takeover(@CurrentAccess() access: AccessContext, @Param('id') id: string): Promise<AttemptSession> {
    return this.service.takeover(access, parseContract(Id, id));
  }

  @Get('attempts/:id/paper')
  paper(@CurrentAccess() access: AccessContext, @Param('id') id: string): Promise<AttemptPaper> {
    return this.service.paper(access, parseContract(Id, id));
  }

  @Get('attempts/:id/images/:assetId')
  image(@CurrentAccess() access: AccessContext, @Param('id') id: string, @Param('assetId') assetId: string): Promise<AssetViewUrl> {
    return this.service.image(access, parseContract(Id, id), parseContract(Id, assetId));
  }

  @Post('attempts/:id/sync')
  @HttpCode(200)
  sync(
    @CurrentAccess() access: AccessContext,
    @Param('id') id: string,
    @Headers(ATTEMPT_SESSION_HEADER) token: string | undefined,
    @Body() body: unknown,
  ): Promise<SyncAttemptResponse> {
    return this.service.sync(access, parseContract(Id, id), parseContract(Token, token), parseContract(SyncAttemptRequest, body));
  }

  @Post('attempts/:id/submit')
  @HttpCode(200)
  submit(
    @CurrentAccess() access: AccessContext,
    @Param('id') id: string,
    @Headers(ATTEMPT_SESSION_HEADER) token: string | undefined,
    @Body() body: unknown,
  ): Promise<AttemptSummary> {
    return this.service.submit(access, parseContract(Id, id), parseContract(Token, token), parseContract(SyncAttemptRequest, body));
  }

  @Get('attempts/:id/summary')
  summary(@CurrentAccess() access: AccessContext, @Param('id') id: string): Promise<AttemptSummary> {
    return this.service.summary(access, parseContract(Id, id));
  }
}
