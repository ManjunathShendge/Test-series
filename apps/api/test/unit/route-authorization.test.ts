import 'reflect-metadata';
import { Reflector } from '@nestjs/core';
import type { ExecutionContext } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import type { Role } from '@exam-prep/contracts';
import { AuthoringController } from '../../src/modules/authoring/http/authoring.controller.js';
import { ExaminerTestsController } from '../../src/modules/authoring/http/examiner-tests.controller.js';
import { AdminCatalogueController } from '../../src/modules/catalogue/http/admin-catalogue.controller.js';
import {
  AdminCommerceController,
  AdminPayoutsController,
  ExaminerEarningsController,
} from '../../src/modules/commerce/http/commerce.controller.js';
import type { AccessContext, IdentityService } from '../../src/modules/identity/application/identity.service.js';
import { RolesGuard } from '../../src/modules/identity/http/roles.guard.js';
import { ExaminerQualityController, QcReviewController } from '../../src/modules/qc/http/qc.controller.js';

/*
 * Route-level authorization: every staff and examiner endpoint refuses the wrong role before a
 * service runs (services and row-level security check again behind it).
 */

const none = { ops: false, finance: false, super: false };
const who: Record<string, AccessContext> = {
  student: { profileId: 's', roles: ['student'], admin: none },
  examiner: { profileId: 'e', roles: ['student', 'examiner'], admin: none },
  reviewer: { profileId: 'r', roles: ['qc_reviewer'], admin: none },
  ops: { profileId: 'o', roles: ['admin'], admin: { ...none, ops: true } },
  finance: { profileId: 'f', roles: ['admin'], admin: { ...none, finance: true } },
  super: { profileId: 'x', roles: ['admin'], admin: { ...none, super: true } },
  // The admin role without any permission flag opens nothing that needs one.
  bareAdmin: { profileId: 'b', roles: ['admin' as Role], admin: none },
};

type Ctor = abstract new (...args: never[]) => object;

async function allowed(person: keyof typeof who, controller: Ctor, method: string): Promise<boolean> {
  const identity = { resolveAccess: async () => who[person] } as unknown as IdentityService;
  const guard = new RolesGuard(new Reflector(), identity);
  const handler = (controller.prototype as Record<string, unknown>)[method];
  if (typeof handler !== 'function') throw new Error(`${controller.name}.${method} not found`);
  const request = { headers: {}, identity: { uid: 'u' } };
  const context = {
    getHandler: () => handler,
    getClass: () => controller,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  try {
    return await guard.canActivate(context);
  } catch {
    return false;
  }
}

const cases: [string, Ctor, string, (keyof typeof who)[]][] = [
  ['admin catalogue (ops)', AdminCatalogueController, 'listCategories', ['ops', 'super']],
  ['admin students (ops)', AdminCommerceController, 'students', ['ops', 'super']],
  ['admin payouts (finance)', AdminPayoutsController, 'list', ['finance', 'super']],
  ['QC review queue', QcReviewController, 'queue', ['reviewer', 'ops', 'finance', 'super', 'bareAdmin']],
  ['examiner tests', ExaminerTestsController, 'listTests', ['examiner']],
  ['examiner question bank', AuthoringController, 'listQuestions', ['examiner']],
  ['examiner sales', ExaminerEarningsController, 'sales', ['examiner']],
  ['examiner quality', ExaminerQualityController, 'quality', ['examiner']],
  ['examiner application (anyone signed in)', AuthoringController, 'createApplication', Object.keys(who) as (keyof typeof who)[]],
];

describe('route authorization', () => {
  for (const [name, controller, method, permitted] of cases) {
    it(name, async () => {
      for (const person of Object.keys(who) as (keyof typeof who)[]) {
        expect({ person, allowed: await allowed(person, controller, method) }).toEqual({ person, allowed: permitted.includes(person) });
      }
    });
  }
});
