'use client';

import { useEffect, useState } from 'react';
import { Alert, Badge, Button, Card, CardBody, CardHeader, Field, Input, Textarea } from '@/components/ui/primitives';
import { usePlatformSettings, useUpdatePlatformSettings } from '@/lib/queries/platform-settings';

export default function PlatformSettingsPage() {
  const settings = usePlatformSettings();
  const update = useUpdatePlatformSettings();

  const [maintenanceEnabled, setMaintenanceEnabled] = useState(false);
  const [maintenanceMessage, setMaintenanceMessage] = useState('');
  const [slaHours, setSlaHours] = useState({ LOW: '', NORMAL: '', HIGH: '', URGENT: '' });
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (!settings.data || hydrated) return;
    setMaintenanceEnabled(settings.data.maintenanceMode.enabled);
    setMaintenanceMessage(settings.data.maintenanceMode.message);
    setSlaHours({
      LOW: String(settings.data.supportSlaHours.LOW),
      NORMAL: String(settings.data.supportSlaHours.NORMAL),
      HIGH: String(settings.data.supportSlaHours.HIGH),
      URGENT: String(settings.data.supportSlaHours.URGENT),
    });
    setHydrated(true);
  }, [settings.data, hydrated]);

  if (settings.isError) {
    return (
      <main className="mx-auto max-w-2xl p-6">
        <Alert variant="error">Could not load platform settings.</Alert>
      </main>
    );
  }
  if (!settings.data || !hydrated) {
    return <main className="mx-auto max-w-2xl p-6 text-sm text-muted-foreground">Loading…</main>;
  }

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Platform settings</h1>
        {settings.data.maintenanceMode.enabled && <Badge variant="destructive">Maintenance mode is ON</Badge>}
      </div>

      {update.isError && <Alert variant="error">Could not save these settings.</Alert>}

      <Card>
        <CardHeader
          title="Maintenance mode"
          description="Blocks every write across the platform except this settings page — reads stay open."
        />
        <CardBody className="space-y-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4"
              checked={maintenanceEnabled}
              onChange={(e) => setMaintenanceEnabled(e.target.checked)}
            />
            Enable maintenance mode
          </label>
          <Field label="Message shown to blocked requests" htmlFor="maintenanceMessage">
            <Textarea
              id="maintenanceMessage"
              value={maintenanceMessage}
              onChange={(e) => setMaintenanceMessage(e.target.value)}
            />
          </Field>
          <div className="flex justify-end">
            <Button
              loading={update.isPending}
              onClick={() =>
                update.mutate({
                  maintenanceMode: { enabled: maintenanceEnabled, message: maintenanceMessage.trim() },
                })
              }
            >
              Save maintenance mode
            </Button>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Support ticket SLA"
          description="Hours until a new ticket's first response is due, by priority. Only affects tickets raised after this changes."
        />
        <CardBody className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Urgent" htmlFor="slaUrgent" hint="hours">
              <Input
                id="slaUrgent"
                inputMode="numeric"
                value={slaHours.URGENT}
                onChange={(e) => setSlaHours((prev) => ({ ...prev, URGENT: e.target.value }))}
              />
            </Field>
            <Field label="High" htmlFor="slaHigh" hint="hours">
              <Input
                id="slaHigh"
                inputMode="numeric"
                value={slaHours.HIGH}
                onChange={(e) => setSlaHours((prev) => ({ ...prev, HIGH: e.target.value }))}
              />
            </Field>
            <Field label="Normal" htmlFor="slaNormal" hint="hours">
              <Input
                id="slaNormal"
                inputMode="numeric"
                value={slaHours.NORMAL}
                onChange={(e) => setSlaHours((prev) => ({ ...prev, NORMAL: e.target.value }))}
              />
            </Field>
            <Field label="Low" htmlFor="slaLow" hint="hours">
              <Input
                id="slaLow"
                inputMode="numeric"
                value={slaHours.LOW}
                onChange={(e) => setSlaHours((prev) => ({ ...prev, LOW: e.target.value }))}
              />
            </Field>
          </div>
          <div className="flex justify-end">
            <Button
              loading={update.isPending}
              onClick={() =>
                update.mutate({
                  supportSlaHours: {
                    LOW: Number(slaHours.LOW),
                    NORMAL: Number(slaHours.NORMAL),
                    HIGH: Number(slaHours.HIGH),
                    URGENT: Number(slaHours.URGENT),
                  },
                })
              }
            >
              Save SLA hours
            </Button>
          </div>
        </CardBody>
      </Card>
    </main>
  );
}
