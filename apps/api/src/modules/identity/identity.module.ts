import { Module } from '@nestjs/common';
import type { JSONWebKeySet } from 'jose';
import { ENVIRONMENT } from '../../database/database.module.js';
import type { Environment } from '../../config/env.js';
import { FirebaseIdentityVerifier, IDENTITY_VERIFIER } from '../../providers/firebase/identity-verifier.js';
import { FirebaseAuthGuard } from '../../common/guards/firebase-auth.guard.js';
import { IdentityService } from './application/identity.service.js';
import { IdentityController } from './http/identity.controller.js';
import { RolesGuard } from './http/roles.guard.js';

@Module({
  controllers: [IdentityController],
  providers: [
    IdentityService,
    FirebaseAuthGuard,
    RolesGuard,
    {
      provide: IDENTITY_VERIFIER,
      inject: [ENVIRONMENT],
      useFactory: (env: Environment) =>
        new FirebaseIdentityVerifier(
          env.FIREBASE_PROJECT_ID,
          env.FIREBASE_TEST_JWKS ? (JSON.parse(env.FIREBASE_TEST_JWKS) as JSONWebKeySet) : undefined,
        ),
    },
  ],
  // Other modules import IdentityModule to protect routes with FirebaseAuthGuard + RolesGuard.
  exports: [IdentityService, FirebaseAuthGuard, RolesGuard, IDENTITY_VERIFIER],
})
export class IdentityModule {}
