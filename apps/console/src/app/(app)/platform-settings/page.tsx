'use client';

import { useEffect, useState } from 'react';
import { Alert, Badge, Button, Card, CardBody, CardHeader, Field, Input, Textarea } from '@/components/ui/primitives';
import { usePlatformSettings, useUpdatePlatformSettings } from '@/lib/queries/platform-settings';

type SettingsTab = 'maintenance' | 'features' | 'security' | 'retention';

export default function PlatformSettingsPage() {
  const settings = usePlatformSettings();
  const update = useUpdatePlatformSettings();

  const [activeTab, setActiveTab] = useState<SettingsTab>('maintenance');

  // Maintenance mode state
  const [maintenanceEnabled, setMaintenanceEnabled] = useState(false);
  const [maintenanceMessage, setMaintenanceMessage] = useState('');

  // SLA hours state
  const [slaHours, setSlaHours] = useState({ LOW: '', NORMAL: '', HIGH: '', URGENT: '' });

  // Feature flags state
  const [featureFlags, setFeatureFlags] = useState({
    enableMarketplace: true,
    enableCustomDomains: true,
    enableAdvancedAnalytics: true,
    betaStorefrontThemes: false,
    aiCopilotAssistant: false,
  });

  // Security policy state
  const [securityPolicy, setSecurityPolicy] = useState({
    sessionIdleTimeoutMinutes: '60',
    maxConcurrentSessionsPerUser: '10',
    enforceMfaForStaff: false,
  });

  // Data retention state
  const [dataRetention, setDataRetention] = useState({
    softDeleteRetentionDays: '30',
    auditLogRetentionDays: '365',
    autoPurgeDeletedTenants: false,
  });

  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (!settings.data || hydrated) return;
    const d = settings.data;
    setMaintenanceEnabled(d.maintenanceMode.enabled);
    setMaintenanceMessage(d.maintenanceMode.message);
    setSlaHours({
      LOW: String(d.supportSlaHours.LOW),
      NORMAL: String(d.supportSlaHours.NORMAL),
      HIGH: String(d.supportSlaHours.HIGH),
      URGENT: String(d.supportSlaHours.URGENT),
    });
    if (d.featureFlags) {
      setFeatureFlags({
        enableMarketplace: d.featureFlags.enableMarketplace,
        enableCustomDomains: d.featureFlags.enableCustomDomains,
        enableAdvancedAnalytics: d.featureFlags.enableAdvancedAnalytics,
        betaStorefrontThemes: d.featureFlags.betaStorefrontThemes,
        aiCopilotAssistant: d.featureFlags.aiCopilotAssistant,
      });
    }
    if (d.securityPolicy) {
      setSecurityPolicy({
        sessionIdleTimeoutMinutes: String(d.securityPolicy.sessionIdleTimeoutMinutes),
        maxConcurrentSessionsPerUser: String(d.securityPolicy.maxConcurrentSessionsPerUser),
        enforceMfaForStaff: d.securityPolicy.enforceMfaForStaff,
      });
    }
    if (d.dataRetention) {
      setDataRetention({
        softDeleteRetentionDays: String(d.dataRetention.softDeleteRetentionDays),
        auditLogRetentionDays: String(d.dataRetention.auditLogRetentionDays),
        autoPurgeDeletedTenants: d.dataRetention.autoPurgeDeletedTenants,
      });
    }
    setHydrated(true);
  }, [settings.data, hydrated]);

  if (settings.isError) {
    return (
      <main className="mx-auto max-w-4xl p-6">
        <Alert variant="error">Could not load platform settings.</Alert>
      </main>
    );
  }
  if (!settings.data || !hydrated) {
    return <main className="mx-auto max-w-4xl p-6 text-sm text-muted-foreground">Loading…</main>;
  }

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">Platform settings</h1>
            {settings.data.maintenanceMode.enabled && <Badge variant="destructive">Maintenance mode is ON</Badge>}
          </div>
          <p className="text-sm text-muted-foreground">
            Platform-wide governance, operational feature flags, security policies, and lifecycle retention rules.
          </p>
        </div>
      </div>

      {update.isError && <Alert variant="error">Could not save these settings. Please check your inputs and try again.</Alert>}
      {update.isSuccess && <Alert variant="success">Platform settings successfully updated.</Alert>}

      {/* Tabs */}
      <div className="flex gap-2 border-b">
        <button
          type="button"
          onClick={() => setActiveTab('maintenance')}
          className={`border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'maintenance'
              ? 'border-primary text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          General & Maintenance
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('features')}
          className={`border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'features'
              ? 'border-primary text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          Global Feature Flags
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('security')}
          className={`border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'security'
              ? 'border-primary text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          Security Policy
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('retention')}
          className={`border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'retention'
              ? 'border-primary text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          Data Retention & Lifecycle
        </button>
      </div>

      {/* Tab 1: General & Maintenance */}
      {activeTab === 'maintenance' && (
        <div className="space-y-6">
          <Card>
            <CardHeader
              title="Maintenance mode"
              description="Blocks every write across the platform except this settings page — reads stay open."
            />
            <CardBody className="space-y-4">
              <label className="flex items-center gap-2 text-sm font-medium">
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
                  placeholder="The platform is temporarily down for maintenance."
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
        </div>
      )}

      {/* Tab 2: Global Feature Flags */}
      {activeTab === 'features' && (
        <Card>
          <CardHeader
            title="Platform feature flags"
            description="Toggle global availability of key features across all tenants. Individual tenants can override these in Tenant 360."
          />
          <CardBody className="space-y-5">
            <div className="space-y-4 divide-y">
              <div className="flex items-center justify-between pt-2">
                <div>
                  <p className="text-sm font-medium">Marketplace & Multi-Vendor</p>
                  <p className="text-xs text-muted-foreground">Supplier and reseller product sharing and commission splits</p>
                </div>
                <input
                  type="checkbox"
                  className="size-4"
                  checked={featureFlags.enableMarketplace}
                  onChange={(e) => setFeatureFlags((prev) => ({ ...prev, enableMarketplace: e.target.checked }))}
                />
              </div>

              <div className="flex items-center justify-between pt-4">
                <div>
                  <p className="text-sm font-medium">Custom Domains & Automated SSL</p>
                  <p className="text-xs text-muted-foreground">Allow merchants to bind custom apex and subdomains</p>
                </div>
                <input
                  type="checkbox"
                  className="size-4"
                  checked={featureFlags.enableCustomDomains}
                  onChange={(e) => setFeatureFlags((prev) => ({ ...prev, enableCustomDomains: e.target.checked }))}
                />
              </div>

              <div className="flex items-center justify-between pt-4">
                <div>
                  <p className="text-sm font-medium">Advanced Analytics & Cohorts</p>
                  <p className="text-xs text-muted-foreground">Deep cohort retention, funnel analytics, and revenue breakdowns</p>
                </div>
                <input
                  type="checkbox"
                  className="size-4"
                  checked={featureFlags.enableAdvancedAnalytics}
                  onChange={(e) => setFeatureFlags((prev) => ({ ...prev, enableAdvancedAnalytics: e.target.checked }))}
                />
              </div>

              <div className="flex items-center justify-between pt-4">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">Beta Storefront Themes</p>
                    <Badge variant="warning">Beta</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">Expose upcoming experimental themes in the merchant theme library</p>
                </div>
                <input
                  type="checkbox"
                  className="size-4"
                  checked={featureFlags.betaStorefrontThemes}
                  onChange={(e) => setFeatureFlags((prev) => ({ ...prev, betaStorefrontThemes: e.target.checked }))}
                />
              </div>

              <div className="flex items-center justify-between pt-4">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">AI Copilot Merchant Assistant</p>
                    <Badge variant="info">Labs</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">AI copy generator and inventory demand predictor for merchants</p>
                </div>
                <input
                  type="checkbox"
                  className="size-4"
                  checked={featureFlags.aiCopilotAssistant}
                  onChange={(e) => setFeatureFlags((prev) => ({ ...prev, aiCopilotAssistant: e.target.checked }))}
                />
              </div>
            </div>

            <div className="flex justify-end pt-4">
              <Button
                loading={update.isPending}
                onClick={() =>
                  update.mutate({
                    featureFlags,
                  })
                }
              >
                Save feature flags
              </Button>
            </div>
          </CardBody>
        </Card>
      )}

      {/* Tab 3: Security Policy */}
      {activeTab === 'security' && (
        <Card>
          <CardHeader
            title="Session & Security Governance"
            description="Control session lifespans, concurrent login thresholds, and credential policies across platform and tenant accounts."
          />
          <CardBody className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Session idle timeout" htmlFor="sessionIdleTimeout" hint="minutes">
                <Input
                  id="sessionIdleTimeout"
                  inputMode="numeric"
                  value={securityPolicy.sessionIdleTimeoutMinutes}
                  onChange={(e) =>
                    setSecurityPolicy((prev) => ({ ...prev, sessionIdleTimeoutMinutes: e.target.value }))
                  }
                />
              </Field>
              <Field label="Max concurrent sessions per user" htmlFor="maxConcurrentSessions" hint="devices">
                <Input
                  id="maxConcurrentSessions"
                  inputMode="numeric"
                  value={securityPolicy.maxConcurrentSessionsPerUser}
                  onChange={(e) =>
                    setSecurityPolicy((prev) => ({ ...prev, maxConcurrentSessionsPerUser: e.target.value }))
                  }
                />
              </Field>
            </div>

            <div className="pt-2">
              <label className="flex items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  className="size-4"
                  checked={securityPolicy.enforceMfaForStaff}
                  onChange={(e) => setSecurityPolicy((prev) => ({ ...prev, enforceMfaForStaff: e.target.checked }))}
                />
                Enforce Multi-Factor Authentication (MFA) for all platform staff
              </label>
              <p className="text-xs text-muted-foreground ml-6">
                Requires staff accounts to configure TOTP before accessing privileged admin endpoints.
              </p>
            </div>

            <div className="flex justify-end pt-4">
              <Button
                loading={update.isPending}
                onClick={() =>
                  update.mutate({
                    securityPolicy: {
                      sessionIdleTimeoutMinutes: Number(securityPolicy.sessionIdleTimeoutMinutes),
                      maxConcurrentSessionsPerUser: Number(securityPolicy.maxConcurrentSessionsPerUser),
                      enforceMfaForStaff: securityPolicy.enforceMfaForStaff,
                    },
                  })
                }
              >
                Save security policy
              </Button>
            </div>
          </CardBody>
        </Card>
      )}

      {/* Tab 4: Data Retention & Compliance */}
      {activeTab === 'retention' && (
        <Card>
          <CardHeader
            title="Data Retention & Lifecycle Governance"
            description="Manage legal retention windows, soft-deletion grace periods, and automated purge execution."
          />
          <CardBody className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Soft-delete retention grace period" htmlFor="softDeleteRetention" hint="days">
                <Input
                  id="softDeleteRetention"
                  inputMode="numeric"
                  value={dataRetention.softDeleteRetentionDays}
                  onChange={(e) =>
                    setDataRetention((prev) => ({ ...prev, softDeleteRetentionDays: e.target.value }))
                  }
                />
              </Field>
              <Field label="Audit trail retention window" htmlFor="auditLogRetention" hint="days">
                <Input
                  id="auditLogRetention"
                  inputMode="numeric"
                  value={dataRetention.auditLogRetentionDays}
                  onChange={(e) =>
                    setDataRetention((prev) => ({ ...prev, auditLogRetentionDays: e.target.value }))
                  }
                />
              </Field>
            </div>

            <div className="pt-2">
              <label className="flex items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  className="size-4"
                  checked={dataRetention.autoPurgeDeletedTenants}
                  onChange={(e) => setDataRetention((prev) => ({ ...prev, autoPurgeDeletedTenants: e.target.checked }))}
                />
                Enable automated hard purge of expired soft-deleted tenants
              </label>
              <p className="text-xs text-muted-foreground ml-6">
                When enabled, background purge workers permanently drop partitioned databases and records beyond the grace period.
              </p>
            </div>

            <div className="flex justify-end pt-4">
              <Button
                loading={update.isPending}
                onClick={() =>
                  update.mutate({
                    dataRetention: {
                      softDeleteRetentionDays: Number(dataRetention.softDeleteRetentionDays),
                      auditLogRetentionDays: Number(dataRetention.auditLogRetentionDays),
                      autoPurgeDeletedTenants: dataRetention.autoPurgeDeletedTenants,
                    },
                  })
                }
              >
                Save retention policy
              </Button>
            </div>
          </CardBody>
        </Card>
      )}
    </main>
  );
}

