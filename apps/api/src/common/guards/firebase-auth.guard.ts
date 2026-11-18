import {
  Inject,
  Injectable,
  createParamDecorator,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { unauthenticated } from '../errors/api-error.js';
import {
  IDENTITY_VERIFIER,
  type IdentityVerifier,
  type VerifiedIdentity,
} from '../../providers/firebase/identity-verifier.js';

interface AuthenticatedRequest {
  headers: { authorization?: string | undefined };
  identity?: VerifiedIdentity;
}

/** Requires a valid Firebase ID token in `Authorization: Bearer <token>`. */
@Injectable()
export class FirebaseAuthGuard implements CanActivate {
  constructor(@Inject(IDENTITY_VERIFIER) private readonly verifier: IdentityVerifier) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const match = /^Bearer ([\w-]+\.[\w-]+\.[\w-]+)$/.exec(request.headers.authorization ?? '');
    if (!match?.[1]) throw unauthenticated();
    try {
      request.identity = await this.verifier.verify(match[1]);
    } catch {
      throw unauthenticated();
    }
    return true;
  }
}

/** The identity verified by FirebaseAuthGuard. */
export const CurrentIdentity = createParamDecorator((_: unknown, context: ExecutionContext) => {
  const identity = context.switchToHttp().getRequest<AuthenticatedRequest>().identity;
  if (!identity) throw unauthenticated();
  return identity;
});
