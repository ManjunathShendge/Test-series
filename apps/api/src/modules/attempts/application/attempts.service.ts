import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { withUser, type Database, type DatabaseClient } from '@exam-prep/db';
import type {
  AssetViewUrl,
  AttemptEvent,
  AttemptPaper,
  AttemptSection,
  AttemptSession,
  AttemptState,
  AttemptSummary,
  MyAttemptList,
  SyncAttemptRequest,
  SyncAttemptResponse,
} from '@exam-prep/contracts';
import { DATABASE, ENVIRONMENT } from '../../../database/database.module.js';
import type { Environment } from '../../../config/env.js';
import { ApiError, notFound } from '../../../common/errors/api-error.js';
import { ObjectStorage } from '../../../providers/storage/object-storage.js';
import type { AccessContext } from '../../identity/application/identity.service.js';
import { attemptsRepository as repo, type AnswerRow, type AttemptRow, type SectionRow } from '../repositories/attempts.repository.js';

const hash = (token: string) => createHash('sha256').update(token).digest('hex');
const pgCode = (error: unknown) => (error as { code?: unknown } | null)?.code;

function sameHash(stored: string | null, token: string | undefined): boolean {
  if (!stored || !token) return false;
  const a = Buffer.from(stored, 'utf8');
  const b = Buffer.from(hash(token), 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

function mapError(error: unknown): never {
  if (error instanceof ApiError) throw error;
  const code = pgCode(error);
  const message = (error as { message?: string }).message;
  if (code === 'MP402') throw new ApiError(403, 'NOT_ENTITLED', 'Buy this test, or its series, to attempt it.');
  if (code === 'MP409')
    throw new ApiError(409, 'ATTEMPT_IN_PROGRESS', 'Finish or submit the test you already started first.', {
      attemptId: (error as { detail?: string }).detail,
    });
  if (code === 'P0002') throw new ApiError(404, 'NOT_FOUND', message ?? 'Not found');
  if (code === '42501') throw new ApiError(403, 'FORBIDDEN', message ?? 'You do not have permission to do this');
  if (code === '23514') throw new ApiError(422, 'VALIDATION_FAILED', message ?? 'Invalid request');
  throw error;
}

const replaced = () =>
  new ApiError(409, 'SESSION_REPLACED', 'This test is open on another device or tab. Continue here to move it to this one.');

function palette(event: Extract<AttemptEvent, { kind: 'answer' }>): AnswerRow['palette_state'] {
  if (!event.visited && !event.selected) return 'not_visited';
  if (event.selected) return event.marked ? 'answered_and_marked' : 'answered';
  return event.marked ? 'marked_for_review' : 'not_answered';
}

function section(row: SectionRow): AttemptSection {
  return {
    id: row.section_id,
    name: row.name,
    order: row.section_order,
    questionCount: row.question_count,
    positiveMarks: Number(row.positive_marks),
    negativeMarks: Number(row.negative_marks),
    durationSeconds: row.duration_seconds,
    opensAt: row.opens_at?.toISOString() ?? null,
    closesAt: row.closes_at?.toISOString() ?? null,
    closedAt: row.closed_at?.toISOString() ?? null,
    state: row.state,
  };
}

/** Stable JSON for comparing a replayed event with the stored one. */
const canonical = (value: unknown) => JSON.stringify(value, Object.keys(value as object).sort());

/**
 * The CBT attempt lifecycle (PRD 6.4, TEST_ENGINE.md): start after the instructions, one writer
 * per attempt (session secret and epoch, explicit takeover), contiguous numbered events with
 * replay detection, server-enforced deadline and section windows, then scoring on submit or by
 * the deadline finalizer. Every rule is also enforced in the database.
 */
@Injectable()
export class AttemptsService {
  private readonly storage: ObjectStorage;

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(ENVIRONMENT) env: Environment,
  ) {
    this.storage = new ObjectStorage(env);
  }

  private as<T>(access: AccessContext, action: (client: DatabaseClient) => Promise<T>): Promise<T> {
    return withUser(this.db, access.profileId, async (client) => {
      try {
        return await action(client);
      } catch (error) {
        return mapError(error);
      }
    });
  }

  private async own(client: DatabaseClient, access: AccessContext, attemptId: string, lock = false): Promise<AttemptRow> {
    const row = await repo.attempt(client, attemptId, lock);
    if (!row || row.student_id !== access.profileId) throw notFound('Attempt');
    return row;
  }

  private async state(client: DatabaseClient, row: AttemptRow): Promise<AttemptState> {
    const [sections, answers] = await Promise.all([repo.sections(client, row.id), repo.answers(client, row.id)]);
    const current = answers.find((a) => a.question_id === row.current_question_id)?.test_question_id ?? null;
    return {
      attemptId: row.id,
      testId: row.test_id,
      testTitle: row.test_title,
      testSlug: row.test_slug,
      examName: row.exam_name,
      hasHindi: row.has_hindi,
      status: row.status,
      attemptNumber: row.attempt_number,
      startedAt: row.started_at.toISOString(),
      expiresAt: row.server_expires_at.toISOString(),
      serverNow: row.server_now.toISOString(),
      sectional: sections.some((s) => s.duration_seconds !== null),
      sections: sections.map(section),
      currentTestQuestionId: current,
      epoch: row.session_epoch,
      ackSeq: row.ack_seq,
      answers: answers.map((a) => ({
        testQuestionId: a.test_question_id,
        selected: a.selected_option,
        marked: a.palette_state === 'marked_for_review' || a.palette_state === 'answered_and_marked',
        visited: a.palette_state !== 'not_visited',
        timeMs: a.time_spent_seconds * 1000,
      })),
      watermark: row.student_id.slice(0, 8).toUpperCase(),
    };
  }

  /** PRD 6.4 start: after "I have read the instructions". Repeats return the same attempt. */
  start(access: AccessContext, testId: string): Promise<AttemptSession | { attemptId: string; resume: true }> {
    const token = randomBytes(32).toString('base64url');
    return this.as(access, async (client) => {
      const id = await repo.start(client, testId, hash(token));
      const row = (await this.own(client, access, id))!;
      // An attempt already running for this test: the client resumes it (and may take it over).
      if (!sameHash(row.active_session_token, token)) return { attemptId: id, resume: true as const };
      return { state: await this.state(client, row), sessionToken: token };
    });
  }

  get(access: AccessContext, attemptId: string, token: string | undefined): Promise<AttemptState> {
    return this.as(access, async (client) => {
      let row = await this.own(client, access, attemptId);
      if (row.status === 'in_progress') {
        if (!sameHash(row.active_session_token, token)) throw replaced();
        await repo.tick(client, attemptId, false);
        row = (await repo.attempt(client, attemptId))!;
      }
      return this.state(client, row);
    });
  }

  /** Moves the attempt to this device or tab; the old one gets SESSION_REPLACED on its next sync. */
  takeover(access: AccessContext, attemptId: string): Promise<AttemptSession> {
    const token = randomBytes(32).toString('base64url');
    return this.as(access, async (client) => {
      const row = await this.own(client, access, attemptId, true);
      if (row.status !== 'in_progress') throw new ApiError(409, 'ATTEMPT_CLOSED', 'This attempt has already finished.');
      await repo.setSession(client, attemptId, hash(token));
      await repo.tick(client, attemptId, false);
      return { state: await this.state(client, (await repo.attempt(client, attemptId))!), sessionToken: token };
    });
  }

  paper(access: AccessContext, attemptId: string): Promise<AttemptPaper> {
    return this.as(access, async (client) => {
      await this.own(client, access, attemptId);
      const rows = await repo.paper(client, attemptId);
      return {
        questions: rows.map((r, i) => ({
          testQuestionId: r.test_question_id,
          sectionId: r.section_id,
          number: i + 1,
          stemEn: r.stem_en,
          stemHi: r.stem_hi,
          passageEn: r.passage_en,
          passageHi: r.passage_hi,
          options: r.options.map((o) => (o.textHi ? { id: o.id, textEn: o.textEn, textHi: o.textHi } : { id: o.id, textEn: o.textEn })),
          imageAssetIds: r.image_asset_ids,
          positiveMarks: Number(r.positive_marks),
          negativeMarks: Number(r.negative_marks),
        })),
      };
    });
  }

  async image(access: AccessContext, attemptId: string, assetId: string): Promise<AssetViewUrl> {
    const asset = await this.as(access, (client) => repo.image(client, attemptId, assetId));
    if (!asset) throw notFound('Image');
    const signed = await this.storage.presignedView(asset.bucket, asset.object_key, asset.mime_type);
    return { url: signed.url, expiresAt: signed.expiresAt.toISOString() };
  }

  /**
   * Ingests contiguous events under the attempt lock (TEST_ENGINE "Durable outbox protocol").
   * Replays with the same payload are no-ops, different payloads conflict, gaps are refused.
   * Events that arrive after their section or the test closed are acknowledged as rejected,
   * never silently dropped.
   */
  private async ingest(client: DatabaseClient, access: AccessContext, attemptId: string, token: string | undefined, req: SyncAttemptRequest) {
    const row = await this.own(client, access, attemptId, true);
    if (row.status === 'in_progress' && (!sameHash(row.active_session_token, token) || req.epoch !== row.session_epoch)) throw replaced();
    const rejected: { seq: number; reason: string }[] = [];
    let ack = row.ack_seq;
    if (row.status !== 'in_progress') {
      // Submitted elsewhere or timed out: nothing more is accepted; tell the client.
      for (const event of req.events) if (event.seq > ack) rejected.push({ seq: event.seq, reason: 'attempt_closed' });
      return { row, ack, rejected };
    }
    await repo.tick(client, attemptId, false);
    const now = row.server_now.getTime();
    const open = now < row.server_expires_at.getTime();
    const sections = await repo.sections(client, attemptId);
    const answers = new Map((await repo.answers(client, attemptId)).map((a) => [a.test_question_id, a]));
    const openSections = () => new Set(sections.filter((s) => s.state === 'open').map((s) => s.section_id));
    let windows = openSections();

    for (const event of [...req.events].sort((a, b) => a.seq - b.seq)) {
      if (event.seq <= ack) {
        const stored = await repo.storedEvent(client, attemptId, row.session_epoch, event.seq);
        if (stored && canonical(stored.payload) !== canonical(event))
          throw new ApiError(409, 'SYNC_CONFLICT', 'This answer was already saved with different content. Reload the test.', { ackSeq: ack });
        continue;
      }
      if (event.seq !== ack + 1) throw new ApiError(409, 'SYNC_GAP', 'Some answers are missing; send them in order.', { ackSeq: ack });
      let reason: string | null = null;
      if (!open) reason = 'time_up';
      else if (event.kind === 'answer') {
        const answer = answers.get(event.testQuestionId);
        if (!answer) reason = 'unknown_question';
        else if (!windows.has(answer.section_id)) reason = 'section_closed';
        else
          await repo.saveAnswer(client, answer.id, {
            selected: event.selected,
            palette: palette(event),
            seconds: Math.floor(event.timeMs / 1000),
          });
      } else if (event.kind === 'next_section') {
        if (!windows.has(event.fromSectionId)) reason = 'section_closed';
        else {
          await repo.tick(client, attemptId, true);
          const refreshed = await repo.sections(client, attemptId);
          sections.splice(0, sections.length, ...refreshed);
          windows = openSections();
        }
      } else {
        await repo.noteFocusLost(client, attemptId);
      }
      await repo.recordEvent(client, attemptId, row.session_epoch, event.seq, event, reason === null, reason);
      if (reason) rejected.push({ seq: event.seq, reason });
      ack = event.seq;
    }
    const current = req.currentTestQuestionId ? (answers.get(req.currentTestQuestionId)?.question_id ?? null) : null;
    await repo.setProgress(client, attemptId, ack, current);
    return { row, ack, rejected };
  }

  sync(access: AccessContext, attemptId: string, token: string | undefined, req: SyncAttemptRequest): Promise<SyncAttemptResponse> {
    return this.as(access, async (client) => {
      const { ack, rejected } = await this.ingest(client, access, attemptId, token, req);
      const row = (await repo.attempt(client, attemptId))!;
      return {
        ackSeq: ack,
        rejected,
        status: row.status,
        serverNow: row.server_now.toISOString(),
        expiresAt: row.server_expires_at.toISOString(),
        sections: (await repo.sections(client, attemptId)).map(section),
      };
    });
  }

  /** Final events and closure in one transaction; repeats return the same result. */
  submit(access: AccessContext, attemptId: string, token: string | undefined, req: SyncAttemptRequest): Promise<AttemptSummary> {
    return this.as(access, async (client) => {
      const { row } = await this.ingest(client, access, attemptId, token, req);
      if (row.status === 'in_progress') await repo.finish(client, attemptId, false);
      return this.summaryOf(client, (await repo.attempt(client, attemptId))!);
    });
  }

  summary(access: AccessContext, attemptId: string): Promise<AttemptSummary> {
    return this.as(access, async (client) => {
      let row = await this.own(client, access, attemptId, true);
      // Past the deadline but not yet collected by the finalizer: close it now.
      if (row.status === 'in_progress' && row.server_now >= row.server_expires_at) {
        await repo.finish(client, attemptId, true);
        row = (await repo.attempt(client, attemptId))!;
      }
      if (row.status === 'in_progress') throw new ApiError(409, 'ATTEMPT_IN_PROGRESS', 'This test is still in progress.', { attemptId });
      return this.summaryOf(client, row);
    });
  }

  private async summaryOf(client: DatabaseClient, row: AttemptRow): Promise<AttemptSummary> {
    const [extras, sections] = await Promise.all([repo.summaryExtras(client, row.id, row.test_id), repo.sectionMax(client, row.id)]);
    return {
      attemptId: row.id,
      testTitle: row.test_title,
      testSlug: row.test_slug,
      status: row.status,
      submittedAt: row.submitted_at?.toISOString() ?? null,
      score: Number(row.total_score),
      maxScore: Number(extras.max_score),
      attempted: row.attempted_count,
      correct: row.correct_count,
      incorrect: row.incorrect_count,
      skipped: row.skipped_count,
      totalQuestions: row.total_questions,
      rank: row.attempt_number === 1 ? row.rank : null,
      percentile: row.attempt_number === 1 && row.percentile !== null ? Number(row.percentile) : null,
      rankedAttempts: extras.ranked,
      sections: sections.map((s) => {
        const got = row.sectional_scores[s.section_id];
        return {
          sectionId: s.section_id,
          name: s.name,
          score: Number(got?.score ?? 0),
          maxScore: Number(s.max_score),
          correct: got?.correct ?? 0,
          incorrect: got?.incorrect ?? 0,
          attempted: got?.attempted ?? 0,
          total: got?.total ?? 0,
        };
      }),
      lateEvents: extras.late,
    };
  }

  mine(access: AccessContext): Promise<MyAttemptList> {
    return this.as(access, async (client) => ({
      items: (await repo.mine(client, access.profileId)).map((r) => ({
        attemptId: r.id,
        testId: r.test_id,
        testTitle: r.test_title,
        testSlug: r.test_slug,
        status: r.status,
        startedAt: r.started_at.toISOString(),
        expiresAt: r.server_expires_at.toISOString(),
        submittedAt: r.submitted_at?.toISOString() ?? null,
        score: Number(r.total_score),
        totalQuestions: r.total_questions,
      })),
    }));
  }
}
