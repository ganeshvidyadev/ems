import 'reflect-metadata';
import { IS_PUBLIC_KEY } from '../../src/common/decorators';
import { AuthController } from '../../src/modules/auth/auth.controller';
import { JwksController } from '../../src/modules/auth/jwks.controller';
import { SessionController } from '../../src/modules/auth/session.controller';
import { HealthController } from '../../src/modules/health/health.controller';
import { MetricsController } from '../../src/modules/health/metrics.controller';
import {
  InvitationAcceptController,
  InvitationController,
} from '../../src/modules/user/invitation.controller';
import {
  PlanController,
  SubscriptionController,
} from '../../src/modules/subscription/subscription.controller';
import {
  BillingController,
  DevPaymentController,
} from '../../src/modules/payment/payment.controller';
import { PaymentWebhookController } from '../../src/modules/payment/payment-webhook.controller';

/**
 * The route-exposure gate (docs/05 Phase 2 exit criteria).
 *
 * `JwtAuthGuard` is registered globally, so authentication is deny-by-default and a
 * route becomes public only by carrying `@Public()`. That inverts the usual failure
 * mode — you cannot forget to protect an endpoint — but it introduces a new one:
 * `@Public()` applied carelessly, or copy-pasted onto a handler that should be
 * authenticated, silently exposes it and nothing fails.
 *
 * This test pins the **complete** set of public routes to an explicit allowlist. Adding
 * `@Public()` anywhere else fails CI, which forces the decision to be reviewed rather
 * than assumed. Every entry below carries the reason it must be reachable without a
 * token — if a reason cannot be written, the decorator does not belong there.
 */

interface ExpectedPublicRoute {
  controller: string;
  handler: string;
  why: string;
}

const EXPECTED_PUBLIC_ROUTES: ExpectedPublicRoute[] = [
  // --- Auth: the caller has no token yet, by definition ---------------------
  { controller: 'AuthController', handler: 'register', why: 'creating the first account' },
  { controller: 'AuthController', handler: 'verifyEmail', why: 'clicked from an email, pre-login' },
  { controller: 'AuthController', handler: 'resendVerification', why: 'cannot log in until verified' },
  { controller: 'AuthController', handler: 'login', why: 'issues the first token' },
  {
    controller: 'AuthController',
    handler: 'refresh',
    why: 'the access token is expired by definition; authenticated by the refresh cookie',
  },
  {
    controller: 'AuthController',
    handler: 'logout',
    why: 'must succeed even with an already-expired access token, or a user cannot clear their cookie',
  },
  { controller: 'AuthController', handler: 'forgotPassword', why: 'user cannot log in' },
  { controller: 'AuthController', handler: 'resetPassword', why: 'clicked from an email, pre-login' },
  { controller: 'AuthController', handler: 'requestOtp', why: 'OTP is an alternative to a password' },
  { controller: 'AuthController', handler: 'verifyOtp', why: 'issues the first token' },
  {
    controller: 'AuthController',
    handler: 'verifyMfa',
    why: 'holds an MFA challenge token, not an access token; the guard rejects typ=mfa elsewhere',
  },

  // --- Invitations: the invitee has no account yet --------------------------
  {
    controller: 'InvitationAcceptController',
    handler: 'preview',
    why: 'accept page renders before the invitee has an account; authenticated by the emailed token',
  },
  {
    controller: 'InvitationAcceptController',
    handler: 'accept',
    why: 'creates the account itself; authenticated by the single-use emailed token',
  },

  // --- Billing --------------------------------------------------------------
  {
    controller: 'PlanController',
    handler: 'list',
    why: 'the pricing page is pre-signup; requiring a token to see prices is self-defeating',
  },
  {
    controller: 'PaymentWebhookController',
    handler: 'handle',
    why: 'a gateway cannot hold our token — authenticated by HMAC signature instead',
  },
  {
    controller: 'DevPaymentController',
    handler: 'simulate',
    why: 'dev/test only stand-in for the shopper completing checkout; the stub gateway it drives is forbidden in production by env.schema.ts',
  },

  // --- Infrastructure -------------------------------------------------------
  { controller: 'HealthController', handler: 'live', why: 'Kubernetes liveness probe' },
  { controller: 'HealthController', handler: 'ready', why: 'Kubernetes readiness probe' },
  { controller: 'HealthController', handler: 'startup', why: 'Kubernetes startup probe' },
  { controller: 'MetricsController', handler: 'scrape', why: 'Prometheus scrape; network-restricted in production' },
  {
    controller: 'JwksController',
    handler: 'getJwks',
    why: 'public key discovery (RFC 7517) — publishing it is the point of RS256',
  },
];

/** Controllers to scan. New controllers must be added here as they are built. */
const CONTROLLERS = [
  AuthController,
  SessionController,
  JwksController,
  HealthController,
  MetricsController,
  InvitationController,
  InvitationAcceptController,
  PlanController,
  SubscriptionController,
  BillingController,
  DevPaymentController,
  PaymentWebhookController,
];

function collectPublicRoutes(): { controller: string; handler: string }[] {
  const found: { controller: string; handler: string }[] = [];

  for (const controller of CONTROLLERS) {
    // Class-level @Public() would expose every handler at once — flagged explicitly
    // below rather than being expanded, because it is almost always a mistake.
    if (Reflect.getMetadata(IS_PUBLIC_KEY, controller)) {
      found.push({ controller: controller.name, handler: '*CLASS-LEVEL*' });
    }

    const prototype = controller.prototype as unknown as Record<string, unknown>;
    for (const name of Object.getOwnPropertyNames(prototype)) {
      if (name === 'constructor') continue;

      const descriptor = Object.getOwnPropertyDescriptor(prototype, name);
      if (typeof descriptor?.value !== 'function') continue;

      if (Reflect.getMetadata(IS_PUBLIC_KEY, descriptor.value)) {
        found.push({ controller: controller.name, handler: name });
      }
    }
  }

  return found;
}

function key(route: { controller: string; handler: string }): string {
  return `${route.controller}.${route.handler}`;
}

describe('route exposure', () => {
  const actual = collectPublicRoutes();
  const actualKeys = new Set(actual.map(key));
  const expectedKeys = new Set(EXPECTED_PUBLIC_ROUTES.map(key));

  it('exposes no route that is not on the allowlist', () => {
    const unexpected = [...actualKeys].filter((route) => !expectedKeys.has(route));

    // If this fails, a route was marked @Public(). Either remove the decorator, or add
    // it to EXPECTED_PUBLIC_ROUTES with a written justification.
    expect(unexpected).toEqual([]);
  });

  it('has no stale allowlist entries', () => {
    // A stale entry is dangerous: it silently pre-authorises a future handler that
    // happens to reuse the name.
    const stale = [...expectedKeys].filter((route) => !actualKeys.has(route));
    expect(stale).toEqual([]);
  });

  it('applies @Public() per handler, never to a whole controller', () => {
    const classLevel = actual.filter((route) => route.handler === '*CLASS-LEVEL*');
    expect(classLevel).toEqual([]);
  });

  it('requires a written justification for every public route', () => {
    const unjustified = EXPECTED_PUBLIC_ROUTES.filter((route) => route.why.trim().length < 10);
    expect(unjustified).toEqual([]);
  });

  it('keeps session management authenticated', () => {
    // Sessions expose device and IP history. A public route here would let anyone
    // enumerate where an account has been used from.
    const sessionRoutes = [...actualKeys].filter((route) => route.startsWith('SessionController.'));
    expect(sessionRoutes).toEqual([]);
  });

  it('keeps every password- and MFA-mutating route authenticated', () => {
    // These change the account's security posture. `resetPassword` is the deliberate
    // exception — it authenticates via a single-use emailed token instead.
    const mustBeProtected = [
      'AuthController.changePassword',
      'AuthController.logoutAll',
      'AuthController.enrolMfa',
      'AuthController.confirmMfa',
      'AuthController.disableMfa',
      'AuthController.me',
    ];

    const wronglyPublic = mustBeProtected.filter((route) => actualKeys.has(route));
    expect(wronglyPublic).toEqual([]);
  });

  it('reports the public surface (documentation, not an assertion)', () => {
    console.log(`  ${actual.length} public routes:`);
    for (const route of EXPECTED_PUBLIC_ROUTES) {
      console.log(`    ${key(route).padEnd(42)} ${route.why}`);
    }
  });
});
