'use client';

import { PLATFORM_ROLE_CODES, type PlatformRoleCode } from '@ems/contracts';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Alert, Button, Card, CardBody, CardHeader, Field, Input } from '@/components/ui/primitives';
import { useCreatePlatformUser } from '@/lib/queries/platform-users';

const ROLE_LABEL: Record<PlatformRoleCode, string> = {
  PLATFORM_SUPER_ADMIN: 'Super Admin — unrestricted platform access',
  PLATFORM_SUPPORT: 'Support — tickets, read-only tenants, time-boxed impersonation',
  PLATFORM_BILLING: 'Billing — plans, subscriptions, settlements, refunds',
};

export default function NewPlatformStaffPage() {
  const router = useRouter();
  const createUser = useCreatePlatformUser();

  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [password, setPassword] = useState('');
  const [roles, setRoles] = useState<PlatformRoleCode[]>([]);

  const canSubmit = email.includes('@') && firstName.trim().length > 0 && password.length >= 8 && roles.length > 0;

  function toggleRole(role: PlatformRoleCode) {
    setRoles((prev) => (prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]));
  }

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">New staff account</h1>
        <p className="text-sm text-muted-foreground">
          Creates the account directly with the password below — there is no invite email for platform staff.
        </p>
      </div>

      <Card>
        <CardHeader title="Account details" />
        <CardBody className="space-y-4">
          {createUser.isError && (
            <Alert variant="error">Could not create this account. Check the email isn&apos;t already used.</Alert>
          )}

          <Field label="Email" htmlFor="email">
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="First name" htmlFor="firstName">
              <Input id="firstName" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
            </Field>
            <Field label="Last name" htmlFor="lastName" hint="Optional">
              <Input id="lastName" value={lastName} onChange={(e) => setLastName(e.target.value)} />
            </Field>
          </div>
          <Field label="Initial password" htmlFor="password" hint="At least 8 characters — share it with them directly">
            <Input id="password" type="text" value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>

          <div>
            <p className="mb-2 text-sm font-medium">Roles</p>
            <div className="space-y-2">
              {PLATFORM_ROLE_CODES.map((role) => (
                <label key={role} className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="mt-0.5 size-4"
                    checked={roles.includes(role)}
                    onChange={() => toggleRole(role)}
                  />
                  {ROLE_LABEL[role]}
                </label>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => router.push('/platform-staff')}>
              Cancel
            </Button>
            <Button
              loading={createUser.isPending}
              disabled={!canSubmit}
              onClick={() =>
                createUser.mutate(
                  { email: email.trim(), firstName: firstName.trim(), lastName: lastName.trim() || undefined, password, roleCodes: roles },
                  { onSuccess: () => router.push('/platform-staff') },
                )
              }
            >
              Create account
            </Button>
          </div>
        </CardBody>
      </Card>
    </main>
  );
}
