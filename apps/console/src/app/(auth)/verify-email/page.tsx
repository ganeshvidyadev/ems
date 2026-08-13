'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Card, CardBody, CardHeader } from '@/components/ui/primitives';
import { ApiError, apiPost } from '@/lib/api-client';

type State = 'verifying' | 'verified' | 'failed';

export default function VerifyEmailPage() {
  const token = useSearchParams().get('token') ?? '';
  const [state, setState] = useState<State>(token ? 'verifying' : 'failed');
  const [message, setMessage] = useState<string | null>(
    token ? null : 'This verification link is missing its token.',
  );

  /**
   * The token is single-use, so it must be submitted exactly once.
   *
   * React 18 StrictMode intentionally double-invokes effects in development. Without this
   * guard the second invocation consumes the token the first one already used, and the
   * page reports failure for a verification that actually succeeded — a confusing
   * dev-only bug that looks like a server fault.
   */
  const submitted = useRef(false);

  useEffect(() => {
    if (!token || submitted.current) return;
    submitted.current = true;

    void (async () => {
      try {
        await apiPost('/auth/verify-email', { token });
        setState('verified');
      } catch (error) {
        setState('failed');
        setMessage(
          error instanceof ApiError
            ? error.message
            : 'We could not verify this link. Request a new one.',
        );
      }
    })();
  }, [token]);

  if (state === 'verifying') {
    return (
      <Card>
        <CardHeader title="Verifying your email…" />
        <CardBody>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <span
              className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent"
              aria-hidden
            />
            <span>One moment.</span>
          </div>
        </CardBody>
      </Card>
    );
  }

  if (state === 'verified') {
    return (
      <Card>
        <CardHeader title="Email verified" />
        <CardBody className="space-y-4">
          <Alert variant="success">Your address is confirmed. You can sign in now.</Alert>
          <Link href="/login">
            <Button className="w-full">Sign in</Button>
          </Link>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader title="Verification failed" />
      <CardBody className="space-y-4">
        <Alert variant="error">{message}</Alert>
        <p className="text-xs text-muted-foreground">
          Links expire after 24 hours and can only be used once. If you already verified,
          just sign in.
        </p>
        <Link href="/login" className="block text-center text-xs underline underline-offset-4">
          Back to sign in
        </Link>
      </CardBody>
    </Card>
  );
}
