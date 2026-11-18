import { Inject, Injectable } from '@nestjs/common';
import { withUser, type Database, type DatabaseClient } from '@exam-prep/db';
import type {
  CreateSessionRequest,
  Device,
  DeviceLimitDetails,
  Profile,
  SessionResponse,
  UpdateMeRequest,
} from '@exam-prep/contracts';
import { DATABASE } from '../../../database/database.module.js';
import { ApiError, notFound } from '../../../common/errors/api-error.js';
import type { VerifiedIdentity } from '../../../providers/firebase/identity-verifier.js';
import { identityRepository as repo, type DeviceRow, type ProfileRow } from '../repositories/identity.repository.js';

const pgCode = (error: unknown) => (error as { code?: unknown } | null)?.code;

function toProfile(row: ProfileRow): Profile {
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    preferredLanguage: row.preferred_language,
    preparationStage: row.preparation_stage as Profile['preparationStage'],
    targetExamIds: row.target_exam_ids ?? [],
    roles: row.roles as Profile['roles'],
    onboarded: row.preparation_stage !== null,
  };
}

function toDevice(row: DeviceRow, currentId: string | undefined): Device {
  return {
    id: row.id,
    name: row.device_name,
    platform: row.platform,
    isActive: row.is_active,
    lastActiveAt: row.last_active_at.toISOString(),
    isCurrent: row.id === currentId,
  };
}

@Injectable()
export class IdentityService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /** Signs a verified identity in on a device: bootstraps the profile and registers the device. */
  async createSession(identity: VerifiedIdentity, request: CreateSessionRequest): Promise<SessionResponse> {
    const profileId = await this.resolveProfileId(identity);
    return withUser(this.db, profileId, async (client) => {
      const profile = await this.requireUsableProfile(client, profileId);
      const device = await this.registerDevice(client, profileId, request);
      return { profile: toProfile(profile), device: toDevice(device, device.id) };
    });
  }

  async getMe(identity: VerifiedIdentity, deviceId: string | undefined): Promise<Profile> {
    return this.asRegisteredDevice(identity, deviceId, async (_client, profile) => toProfile(profile));
  }

  async updateMe(identity: VerifiedIdentity, deviceId: string | undefined, changes: UpdateMeRequest): Promise<Profile> {
    return this.asRegisteredDevice(identity, deviceId, async (client, profile) => {
      if (changes.targetExamIds?.length) {
        const unique = [...new Set(changes.targetExamIds)];
        if ((await repo.countActiveExams(client, unique)) !== unique.length) {
          throw new ApiError(400, 'VALIDATION_FAILED', 'One or more target exams do not exist');
        }
      }
      const fields: Parameters<typeof repo.updateProfile>[2] = {};
      if (changes.fullName !== undefined) fields.full_name = changes.fullName;
      if (changes.preferredLanguage !== undefined) fields.preferred_language = changes.preferredLanguage;
      if (changes.preparationStage !== undefined) fields.preparation_stage = changes.preparationStage;
      if (changes.targetExamIds !== undefined) fields.target_exam_ids = [...new Set(changes.targetExamIds)];
      return toProfile(await repo.updateProfile(client, profile.id, fields));
    });
  }

  async listDevices(identity: VerifiedIdentity, deviceId: string | undefined): Promise<Device[]> {
    return this.asRegisteredDevice(identity, deviceId, async (client, profile) =>
      (await repo.listDevices(client, profile.id)).map((row) => toDevice(row, deviceId)),
    );
  }

  /**
   * Revokes one of the user's devices. Deliberately allowed from an unregistered device: a
   * student blocked by the two-device limit removes an old device to continue (DECISIONS C4).
   */
  async revokeDevice(identity: VerifiedIdentity, deviceId: string): Promise<void> {
    const profileId = await this.resolveProfileId(identity);
    await withUser(this.db, profileId, async (client) => {
      await this.requireUsableProfile(client, profileId);
      if (!(await repo.deactivateDevice(client, profileId, deviceId))) throw notFound('Device');
    });
  }

  private async resolveProfileId(identity: VerifiedIdentity): Promise<string> {
    // D01: email sign-in counts only once the address is verified; Google and Apple verify it.
    if (!identity.emailVerified) {
      throw new ApiError(403, 'EMAIL_NOT_VERIFIED', 'Verify your email address to continue');
    }
    try {
      return await repo.ensureProfile(this.db, identity.uid, identity.email, identity.name);
    } catch (error) {
      // Another Firebase identity already owns this email. Never merge on email alone
      // (CLAUDE.md invariant 10): the user signs in with the original method and links.
      if (pgCode(error) === '23505') {
        throw new ApiError(
          409,
          'ACCOUNT_EXISTS_WITH_DIFFERENT_SIGN_IN',
          'An account with this email already exists. Sign in with the method you used before.',
        );
      }
      throw error;
    }
  }

  private async requireUsableProfile(client: DatabaseClient, profileId: string): Promise<ProfileRow> {
    const profile = await repo.getProfile(client, profileId);
    if (!profile || profile.is_blocked || profile.deleted_at) {
      throw new ApiError(403, 'ACCOUNT_BLOCKED', 'This account cannot be used. Contact support.');
    }
    return profile;
  }

  private async registerDevice(client: DatabaseClient, userId: string, request: CreateSessionRequest): Promise<DeviceRow> {
    const existing = request.deviceId ? await repo.findDevice(client, userId, request.deviceId) : undefined;
    // The limit trigger raises inside this transaction; a savepoint keeps it usable for the reply.
    await client.query('SAVEPOINT register_device');
    try {
      return existing
        ? await repo.activateDevice(client, userId, existing.id, request.deviceName)
        : await repo.createDevice(client, userId, request.deviceName, request.platform);
    } catch (error) {
      if (pgCode(error) !== '23514') throw error;
      await client.query('ROLLBACK TO SAVEPOINT register_device');
      const details: DeviceLimitDetails = {
        activeDevices: (await repo.listDevices(client, userId, true)).map((row) => toDevice(row, undefined)),
      };
      throw new ApiError(
        409,
        'DEVICE_LIMIT_REACHED',
        'This account is active on two devices. Remove one to continue.',
        details,
      );
    }
  }

  /** Runs an action for a verified user on an active, registered device of theirs. */
  private async asRegisteredDevice<T>(
    identity: VerifiedIdentity,
    deviceId: string | undefined,
    action: (client: DatabaseClient, profile: ProfileRow) => Promise<T>,
  ): Promise<T> {
    const profileId = await this.resolveProfileId(identity);
    return withUser(this.db, profileId, async (client) => {
      const profile = await this.requireUsableProfile(client, profileId);
      const device = deviceId ? await repo.findDevice(client, profileId, deviceId) : undefined;
      if (!device?.is_active) {
        throw new ApiError(401, 'DEVICE_NOT_REGISTERED', 'This device is signed out. Sign in again.');
      }
      return action(client, profile);
    });
  }
}
