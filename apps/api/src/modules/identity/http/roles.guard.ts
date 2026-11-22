import {
  Injectable,
  SetMetadata,
  createParamDecorator,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DEVICE_ID_HEADER, type Role } from '@exam-prep/contracts';
import { z } from 'zod';
import { ApiError, unauthenticated } from '../../../common/errors/api-error.js';
import type { VerifiedIdentity } from '../../../providers/firebase/identity-verifier.js';
import { IdentityService, type AccessContext, type AdminPermission } from '../application/identity.service.js';

const ROLES_KEY = 'auth:roles';
const ADMIN_KEY = 'auth:admin-permission';
const DeviceIdHeader = z.uuid().optional();

/**
 * Endpoint needs one of these roles. Use with `@UseGuards(FirebaseAuthGuard, RolesGuard)`.
 * Route-level role checks are the first barrier; services still check ownership and
 * row-level security is the last (CLAUDE.md "authorization inside services as well").
 */
export const Roles = (...roles: [Role, ...Role[]]) => SetMetadata(ROLES_KEY, roles);

/** Admin endpoint that also needs a specific admin permission flag (or super admin). */
export const RequireAdminPermission = (permission: AdminPermission) => SetMetadata(ADMIN_KEY, permission);

interface GuardedRequest {
  headers: Record<string, string | string[] | undefined>;
  identity?: VerifiedIdentity;
  access?: AccessContext;
}

/**
 * Authorizes a request already authenticated by FirebaseAuthGuard: the user must be verified,
 * unblocked, on one of their active devices, and hold a required role. Roles and admin flags
 * come from the database on every request, so a revoked role takes effect immediately.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly identity: IdentityService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, targets);
    const permission = this.reflector.getAllAndOverride<AdminPermission | undefined>(ADMIN_KEY, targets);
    const request = context.switchToHttp().getRequest<GuardedRequest>();
    if (!request.identity) throw unauthenticated();

    const header = request.headers[DEVICE_ID_HEADER];
    const device = DeviceIdHeader.safeParse(Array.isArray(header) ? header[0] : header);
    const access = await this.identity.resolveAccess(request.identity, device.success ? device.data : undefined);

    const required: Role[] = permission ? ['admin', ...(roles ?? [])] : (roles ?? []);
    if (required.length && !required.some((r) => access.roles.includes(r))) throw forbidden();
    if (permission && !(access.roles.includes('admin') && (access.admin[permission] || access.admin.super))) throw forbidden();

    request.access = access;
    return true;
  }
}

const forbidden = () => new ApiError(403, 'FORBIDDEN', 'You do not have permission to do this');

/** The caller authorized by RolesGuard. */
export const CurrentAccess = createParamDecorator((_: unknown, context: ExecutionContext): AccessContext => {
  const access = context.switchToHttp().getRequest<GuardedRequest>().access;
  if (!access) throw unauthenticated();
  return access;
});
