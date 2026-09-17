'use client';

import { PLATFORM_ROLE_CODES, type PlatformRoleCode } from '@ems/contracts';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Alert, Button, Card, CardBody, CardHeader, Field, Input } from '@/components/ui/primitives';
import { usePlatformUser, useUpdatePlatformUser } from '@/lib/queries/platform-users';

const ROLE_LABEL: Record<PlatformRoleCode, string> = {
  PLATFORM_SUPER_ADMIN: 'Super Admin — unrestricted platform access',
  PLATFORM_SUPPORT: 'Support — tickets, read-only tenants, time-boxed impersonation',
  PLATFORM_BILLING: 'Billing — plans, subscriptions, settlements, refunds',
};

export default function EditPlatformStaffPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const user = usePlatformUser(params.id);
  const updateUser = useUpdatePlatformUser(params.id);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [roles, setRoles] = useState<PlatformRoleCode[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (!user.data || hydrated) return;
    setFirstName(user.data.firstName);
    setLastName(user.data.lastName ?? '');
    setRoles(user.data.roles);
    setHydrated(true);
  }, [user.data, hydrated]);

  if (user.isError) {
    return (
      <main className="mx-auto max-w-2xl p-6">
        <Alert variant="error">Could not load this account.</Alert>
      </main>
    );
  }
  if (!user.data || !hydrated) {
    return <main className="mx-auto max-w-2xl p-6 text-sm text-muted-foreground">Loading…</main>;
  }

  function toggleRole(role: PlatformRoleCode) {
    setRoles((prev) => (prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]));
  }

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {user.data.firstName} {user.data.lastName ?? ''}
        </h1>
        <p className="text-sm text-muted-foreground">{user.data.email}</p>
      </div>

      <Card>
        <CardHeader title="Account details" />
        <CardBody className="space-y-4">
          {updateUser.isError && <Alert variant="error">Could not save these changes.</Alert>}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="First name" htmlFor="firstName">
              <Input id="firstName" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
            </Field>
            <Field label="Last name" htmlFor="lastName" hint="Optional">
              <Input id="lastName" value={lastName} onChange={(e) => setLastName(e.target.value)} />
            </Field>
          </div>

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
              loading={updateUser.isPending}
              disabled={roles.length === 0}
              onClick={() =>
                updateUser.mutate(
                  { firstName: firstName.trim(), lastName: lastName.trim() || null, roleCodes: roles },
                  { onSuccess: () => router.push('/platform-staff') },
                )
              }
            >
              Save changes
            </Button>
          </div>
        </CardBody>
      </Card>
    </main>
  );
}
