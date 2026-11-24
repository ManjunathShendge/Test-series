import { Body, Controller, Delete, Get, Header, Headers, HttpCode, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import {
  CreateSessionRequest,
  DEVICE_ID_HEADER,
  UpdateMeRequest,
  type AccountExport,
  type DeletionStatus,
  type DeviceList,
  type Profile,
  type SessionResponse,
} from '@exam-prep/contracts';
import { CurrentIdentity, FirebaseAuthGuard } from '../../../common/guards/firebase-auth.guard.js';
import { parseContract } from '../../../common/pipes/parse-contract.js';
import type { VerifiedIdentity } from '../../../providers/firebase/identity-verifier.js';
import { IdentityService } from '../application/identity.service.js';

const DeviceIdHeader = z.uuid().optional();
const DeviceIdParam = z.uuid();

@Controller()
@UseGuards(FirebaseAuthGuard)
export class IdentityController {
  constructor(private readonly identity: IdentityService) {}

  @Post('identity/session')
  @HttpCode(200)
  createSession(@CurrentIdentity() who: VerifiedIdentity, @Body() body: unknown): Promise<SessionResponse> {
    return this.identity.createSession(who, parseContract(CreateSessionRequest, body));
  }

  @Get('me')
  getMe(@CurrentIdentity() who: VerifiedIdentity, @Headers(DEVICE_ID_HEADER) device?: string): Promise<Profile> {
    return this.identity.getMe(who, parseContract(DeviceIdHeader, device));
  }

  @Patch('me')
  updateMe(
    @CurrentIdentity() who: VerifiedIdentity,
    @Body() body: unknown,
    @Headers(DEVICE_ID_HEADER) device?: string,
  ): Promise<Profile> {
    return this.identity.updateMe(who, parseContract(DeviceIdHeader, device), parseContract(UpdateMeRequest, body));
  }

  @Get('me/devices')
  async listDevices(@CurrentIdentity() who: VerifiedIdentity, @Headers(DEVICE_ID_HEADER) device?: string): Promise<DeviceList> {
    return { items: await this.identity.listDevices(who, parseContract(DeviceIdHeader, device)) };
  }

  @Delete('me/devices/:id')
  @HttpCode(204)
  async revokeDevice(@CurrentIdentity() who: VerifiedIdentity, @Param('id') id: string): Promise<void> {
    await this.identity.revokeDevice(who, parseContract(DeviceIdParam, id));
  }

  /** Starts the deletion grace period; requires a sign-in within the last five minutes. */
  @Post('me/deletion')
  @HttpCode(200)
  requestDeletion(@CurrentIdentity() who: VerifiedIdentity, @Headers(DEVICE_ID_HEADER) device?: string): Promise<DeletionStatus> {
    return this.identity.requestDeletion(who, parseContract(DeviceIdHeader, device));
  }

  @Delete('me/deletion')
  cancelDeletion(@CurrentIdentity() who: VerifiedIdentity, @Headers(DEVICE_ID_HEADER) device?: string): Promise<DeletionStatus> {
    return this.identity.cancelDeletion(who, parseContract(DeviceIdHeader, device));
  }

  @Get('me/export')
  @Header('Cache-Control', 'no-store')
  @Header('Content-Disposition', 'attachment; filename="my-data.json"')
  exportData(@CurrentIdentity() who: VerifiedIdentity, @Headers(DEVICE_ID_HEADER) device?: string): Promise<AccountExport> {
    return this.identity.exportData(who, parseContract(DeviceIdHeader, device));
  }
}
