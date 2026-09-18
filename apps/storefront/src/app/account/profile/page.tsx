'use client';

import React, { useState, type FormEvent } from 'react';
import { Loader2, CheckCircle2 } from 'lucide-react';
import { useCustomer } from '@/lib/customer-context';
import { api, ApiError } from '@/lib/api-client';
import type { CustomerResponse } from '@ems/contracts';

export default function CustomerProfilePage() {
  const { customer, refreshCustomer, logout } = useCustomer();

  // Profile Form State
  const [firstName, setFirstName] = useState(customer?.firstName ?? '');
  const [lastName, setLastName] = useState(customer?.lastName ?? '');
  const [phone, setPhone] = useState(customer?.phone ?? '');
  const [acceptsMarketing, setAcceptsMarketing] = useState(customer?.acceptsMarketing ?? false);
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // Password Form State
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  async function handleProfileSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setProfileMessage(null);
    setProfileError(null);
    setIsSavingProfile(true);

    try {
      await api.request<CustomerResponse>('auth/profile', {
        method: 'PUT',
        body: {
          firstName: firstName.trim() || undefined,
          lastName: lastName.trim() || undefined,
          phone: phone.trim() || undefined,
          acceptsMarketing,
        },
      });
      await refreshCustomer();
      setProfileMessage('Profile details updated successfully');
    } catch (err) {
      if (err instanceof ApiError) {
        setProfileError(err.message);
      } else {
        setProfileError('Failed to update profile');
      }
    } finally {
      setIsSavingProfile(false);
    }
  }

  async function handlePasswordSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPasswordMessage(null);
    setPasswordError(null);

    if (newPassword !== confirmPassword) {
      setPasswordError('New passwords do not match');
      return;
    }

    setIsChangingPassword(true);
    try {
      await api.request('auth/change-password', {
        method: 'PUT',
        body: { currentPassword, newPassword },
      });
      setPasswordMessage('Password changed successfully');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      if (err instanceof ApiError) {
        setPasswordError(err.message);
      } else {
        setPasswordError('Failed to change password. Ensure current password is correct.');
      }
    } finally {
      setIsChangingPassword(false);
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink">Profile & Security</h1>
        <p className="mt-1 text-sm text-ink-muted">Manage your personal details and account credentials</p>
      </div>

      {/* Edit Profile Card */}
      <div className="rounded-theme border border-line bg-surface p-6">
        <h2 className="text-lg font-semibold text-ink border-b border-line pb-3">Personal Information</h2>

        {profileMessage && (
          <div className="mt-4 flex items-center gap-2 rounded-theme border border-success/20 bg-success/10 p-3 text-sm text-success">
            <CheckCircle2 className="h-4 w-4" />
            <span>{profileMessage}</span>
          </div>
        )}
        {profileError && (
          <div className="mt-4 rounded-theme border border-danger/20 bg-danger/10 p-3 text-sm text-danger">
            {profileError}
          </div>
        )}

        <form onSubmit={handleProfileSubmit} className="mt-4 space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="firstName" className="block text-sm font-medium text-ink">
                First name
              </label>
              <input
                id="firstName"
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="mt-1 block h-10 w-full rounded-theme border border-line bg-surface-alt px-3 text-sm text-ink focus:border-brand focus:bg-surface focus:outline-none focus:ring-1 focus:ring-brand"
              />
            </div>
            <div>
              <label htmlFor="lastName" className="block text-sm font-medium text-ink">
                Last name
              </label>
              <input
                id="lastName"
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="mt-1 block h-10 w-full rounded-theme border border-line bg-surface-alt px-3 text-sm text-ink focus:border-brand focus:bg-surface focus:outline-none focus:ring-1 focus:ring-brand"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-ink">
                Email address
              </label>
              <input
                id="email"
                type="email"
                disabled
                value={customer?.email ?? ''}
                className="mt-1 block h-10 w-full cursor-not-allowed rounded-theme border border-line bg-line/20 px-3 text-sm text-ink-muted"
              />
              <p className="mt-1 text-xs text-ink-muted">Email is linked to your primary login.</p>
            </div>
            <div>
              <label htmlFor="phone" className="block text-sm font-medium text-ink">
                Phone number
              </label>
              <input
                id="phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="mt-1 block h-10 w-full rounded-theme border border-line bg-surface-alt px-3 text-sm text-ink focus:border-brand focus:bg-surface focus:outline-none focus:ring-1 focus:ring-brand"
                placeholder="+91 98765 43210"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 pt-2">
            <input
              id="acceptsMarketing"
              type="checkbox"
              checked={acceptsMarketing}
              onChange={(e) => setAcceptsMarketing(e.target.checked)}
              className="h-4 w-4 rounded border-line text-brand focus:ring-brand"
            />
            <label htmlFor="acceptsMarketing" className="text-xs text-ink">
              I agree to receive promotional updates and offers
            </label>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={isSavingProfile}
              className="inline-flex h-10 items-center justify-center rounded-theme bg-brand px-5 text-sm font-medium text-brand-foreground hover:bg-brand/90 disabled:opacity-50"
            >
              {isSavingProfile ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>

      {/* Change Password Card */}
      <div className="rounded-theme border border-line bg-surface p-6">
        <h2 className="text-lg font-semibold text-ink border-b border-line pb-3">Security & Password</h2>

        {passwordMessage && (
          <div className="mt-4 flex items-center gap-2 rounded-theme border border-success/20 bg-success/10 p-3 text-sm text-success">
            <CheckCircle2 className="h-4 w-4" />
            <span>{passwordMessage}</span>
          </div>
        )}
        {passwordError && (
          <div className="mt-4 rounded-theme border border-danger/20 bg-danger/10 p-3 text-sm text-danger">
            {passwordError}
          </div>
        )}

        <form onSubmit={handlePasswordSubmit} className="mt-4 max-w-md space-y-4">
          <div>
            <label htmlFor="currentPassword" className="block text-sm font-medium text-ink">
              Current password
            </label>
            <input
              id="currentPassword"
              type="password"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="mt-1 block h-10 w-full rounded-theme border border-line bg-surface-alt px-3 text-sm text-ink focus:border-brand focus:bg-surface focus:outline-none focus:ring-1 focus:ring-brand"
            />
          </div>

          <div>
            <label htmlFor="newPassword" className="block text-sm font-medium text-ink">
              New password (min 8 characters)
            </label>
            <input
              id="newPassword"
              type="password"
              required
              minLength={8}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="mt-1 block h-10 w-full rounded-theme border border-line bg-surface-alt px-3 text-sm text-ink focus:border-brand focus:bg-surface focus:outline-none focus:ring-1 focus:ring-brand"
            />
          </div>

          <div>
            <label htmlFor="confirmNewPassword" className="block text-sm font-medium text-ink">
              Confirm new password
            </label>
            <input
              id="confirmNewPassword"
              type="password"
              required
              minLength={8}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="mt-1 block h-10 w-full rounded-theme border border-line bg-surface-alt px-3 text-sm text-ink focus:border-brand focus:bg-surface focus:outline-none focus:ring-1 focus:ring-brand"
            />
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={isChangingPassword}
              className="inline-flex h-10 items-center justify-center rounded-theme bg-ink px-5 text-sm font-medium text-surface hover:bg-ink/90 disabled:opacity-50"
            >
              {isChangingPassword ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Change Password'}
            </button>
          </div>
        </form>
      </div>

      {/* Account Session & Sign Out */}
      <div className="rounded-theme border border-line bg-surface p-6">
        <h2 className="text-lg font-semibold text-ink">Session Management</h2>
        <p className="mt-1 text-sm text-ink-muted">Sign out of your account on this device</p>
        <button
          onClick={() => void logout()}
          className="mt-4 inline-flex h-10 items-center justify-center rounded-theme border border-danger/30 bg-danger/10 px-4 text-sm font-medium text-danger hover:bg-danger/20"
        >
          Sign Out of Account
        </button>
      </div>
    </div>
  );
}
