'use client';

import React, { useState, type FormEvent } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { MapPin, Plus, Trash2, Edit2, Loader2, CheckCircle2, Home, Briefcase, Navigation, Check } from 'lucide-react';
import { api, ApiError } from '@/lib/api-client';
import type { AddressRequest, AddressResponse, UpdateAddressRequest } from '@ems/contracts';

const PINCODE_MAP: Record<string, { city: string; state: string }> = {
  '110001': { city: 'New Delhi', state: 'Delhi' },
  '110002': { city: 'Central Delhi', state: 'Delhi' },
  '110016': { city: 'South Delhi', state: 'Delhi' },
  '110085': { city: 'North West Delhi', state: 'Delhi' },
  '122001': { city: 'Gurugram', state: 'Haryana' },
  '122002': { city: 'Gurugram', state: 'Haryana' },
  '201301': { city: 'Noida', state: 'Uttar Pradesh' },
  '201304': { city: 'Noida', state: 'Uttar Pradesh' },
  '400001': { city: 'Mumbai', state: 'Maharashtra' },
  '400050': { city: 'Bandra Mumbai', state: 'Maharashtra' },
  '400076': { city: 'Powai Mumbai', state: 'Maharashtra' },
  '411001': { city: 'Pune', state: 'Maharashtra' },
  '411014': { city: 'Viman Nagar Pune', state: 'Maharashtra' },
  '560001': { city: 'Bengaluru', state: 'Karnataka' },
  '560034': { city: 'Koramangala Bengaluru', state: 'Karnataka' },
  '560100': { city: 'Electronic City Bengaluru', state: 'Karnataka' },
  '500001': { city: 'Hyderabad', state: 'Telangana' },
  '500081': { city: 'Hitec City Hyderabad', state: 'Telangana' },
  '600001': { city: 'Chennai', state: 'Tamil Nadu' },
  '700001': { city: 'Kolkata', state: 'West Bengal' },
  '302001': { city: 'Jaipur', state: 'Rajasthan' },
  '380001': { city: 'Ahmedabad', state: 'Gujarat' },
  '682001': { city: 'Kochi', state: 'Kerala' },
  '226001': { city: 'Lucknow', state: 'Uttar Pradesh' },
  '452001': { city: 'Indore', state: 'Madhya Pradesh' },
  '160017': { city: 'Chandigarh', state: 'Punjab' },
};

export default function CustomerAddressesPage() {
  const queryClient = useQueryClient();
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [editingAddress, setEditingAddress] = useState<AddressResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: addresses = [], isLoading } = useQuery<AddressResponse[]>({
    queryKey: ['account-addresses'],
    queryFn: () => api.request<AddressResponse[]>('account/addresses'),
  });

  const deleteMutation = useMutation({
    mutationFn: (addressId: string) => api.request(`account/addresses/${addressId}`, { method: 'DELETE' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['account-addresses'] });
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink">Address Book</h1>
          <p className="mt-1 text-sm text-ink-muted">Manage your delivery and billing addresses for 1-click checkout</p>
        </div>
        {!isAddingNew && !editingAddress && (
          <button
            onClick={() => {
              setError(null);
              setIsAddingNew(true);
            }}
            className="inline-flex h-9 items-center gap-1.5 rounded-theme bg-brand px-3 text-xs font-medium text-brand-foreground hover:bg-brand/90"
          >
            <Plus className="h-4 w-4" />
            Add New Address
          </button>
        )}
      </div>

      {error && (
        <div className="rounded-theme border border-danger/20 bg-danger/10 p-3 text-sm text-danger">
          {error}
        </div>
      )}

      {/* Address Form (Add or Edit) */}
      {(isAddingNew || editingAddress) && (
        <AddressForm
          initialData={editingAddress}
          onCancel={() => {
            setIsAddingNew(false);
            setEditingAddress(null);
            setError(null);
          }}
          onSuccess={() => {
            setIsAddingNew(false);
            setEditingAddress(null);
            setError(null);
            void queryClient.invalidateQueries({ queryKey: ['account-addresses'] });
          }}
          onError={(msg) => setError(msg)}
        />
      )}

      {/* Address List */}
      {isLoading ? (
        <div className="flex h-32 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-brand" />
        </div>
      ) : addresses.length === 0 ? (
        <div className="rounded-theme border border-dashed border-line p-12 text-center">
          <MapPin className="mx-auto h-10 w-10 text-ink-muted" />
          <p className="mt-3 text-base font-medium text-ink">No saved addresses</p>
          <p className="mt-1 text-xs text-ink-muted">Add a shipping address for smooth checkout.</p>
          <button
            onClick={() => setIsAddingNew(true)}
            className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-theme bg-brand px-4 text-xs font-medium text-brand-foreground hover:bg-brand/90"
          >
            <Plus className="h-4 w-4" /> Add Address
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {addresses.map((addr) => (
            <div
              key={addr.id}
              className={`flex flex-col justify-between rounded-theme border p-5 transition-shadow hover:shadow-sm ${
                addr.isDefaultShipping ? 'border-brand/40 bg-brand/[0.02]' : 'border-line bg-surface'
              }`}
            >
              <div>
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-ink">{addr.recipientName}</span>
                  {addr.label && (
                    <span className="inline-flex items-center gap-1 rounded bg-surface-alt px-1.5 py-0.5 text-xs font-medium text-ink-muted uppercase">
                      {addr.label.toLowerCase().includes('home') ? <Home className="h-3 w-3" /> : addr.label.toLowerCase().includes('work') || addr.label.toLowerCase().includes('office') ? <Briefcase className="h-3 w-3" /> : <Navigation className="h-3 w-3" />}
                      {addr.label}
                    </span>
                  )}
                  {addr.isDefaultShipping && (
                    <span className="rounded bg-brand/10 px-1.5 py-0.5 text-xs font-medium text-brand">
                      Default Shipping
                    </span>
                  )}
                  {addr.isDefaultBilling && (
                    <span className="rounded bg-line/50 px-1.5 py-0.5 text-xs font-medium text-ink">
                      Default Billing
                    </span>
                  )}
                </div>

                <p className="text-sm text-ink-muted">{addr.addressLine1}</p>
                {addr.addressLine2 && <p className="text-sm text-ink-muted">{addr.addressLine2}</p>}
                {addr.landmark && (
                  <p className="text-xs text-ink-muted italic">Landmark: {addr.landmark}</p>
                )}
                <p className="text-sm font-medium text-ink mt-1">
                  {addr.city}, {addr.stateName || ''} - {addr.postalCode}
                </p>
                <p className="text-xs text-ink-muted mt-0.5 font-mono">{addr.phone}</p>
              </div>

              <div className="mt-4 flex items-center justify-end gap-2 border-t border-line/60 pt-3">
                <button
                  onClick={() => {
                    setError(null);
                    setEditingAddress(addr);
                    setIsAddingNew(false);
                  }}
                  className="inline-flex items-center gap-1 text-xs font-medium text-ink-muted hover:text-brand transition"
                >
                  <Edit2 className="h-3.5 w-3.5" /> Edit
                </button>
                <span className="text-line">|</span>
                <button
                  onClick={() => {
                    if (confirm('Are you sure you want to delete this address?')) {
                      deleteMutation.mutate(addr.id);
                    }
                  }}
                  disabled={deleteMutation.isPending}
                  className="inline-flex items-center gap-1 text-xs font-medium text-ink-muted hover:text-danger transition disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AddressForm({
  initialData,
  onCancel,
  onSuccess,
  onError,
}: {
  initialData?: AddressResponse | null;
  onCancel: () => void;
  onSuccess: () => void;
  onError: (msg: string) => void;
}) {
  const [recipientName, setRecipientName] = useState(initialData?.recipientName ?? '');
  const [phone, setPhone] = useState(initialData?.phone ?? '');
  const [addressLine1, setAddressLine1] = useState(initialData?.addressLine1 ?? '');
  const [addressLine2, setAddressLine2] = useState(initialData?.addressLine2 ?? '');
  const [landmark, setLandmark] = useState(initialData?.landmark ?? '');
  const [city, setCity] = useState(initialData?.city ?? '');
  const [stateName, setStateName] = useState(initialData?.stateName ?? '');
  const [postalCode, setPostalCode] = useState(initialData?.postalCode ?? '');
  const [label, setLabel] = useState(initialData?.label ?? 'Home');
  const [isDefaultShipping, setIsDefaultShipping] = useState(initialData?.isDefaultShipping ?? false);
  const [isDefaultBilling, setIsDefaultBilling] = useState(initialData?.isDefaultBilling ?? false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function handlePincodeChange(val: string) {
    const clean = val.replace(/\D/g, '').slice(0, 6);
    setPostalCode(clean);

    if (clean.length === 6 && PINCODE_MAP[clean]) {
      const match = PINCODE_MAP[clean]!;
      setCity(match.city);
      setStateName(match.state);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);

    const payload: AddressRequest = {
      type: 'BOTH',
      recipientName: recipientName.trim(),
      phone: phone.trim(),
      addressLine1: addressLine1.trim(),
      addressLine2: addressLine2.trim() || undefined,
      landmark: landmark.trim() || undefined,
      city: city.trim(),
      stateName: stateName.trim(),
      postalCode: postalCode.trim(),
      countryCode: 'IN',
      label: label.trim() || undefined,
      isDefaultShipping,
      isDefaultBilling,
    };

    try {
      if (initialData) {
        await api.request(`account/addresses/${initialData.id}`, {
          method: 'PUT',
          body: payload,
        });
      } else {
        await api.request('account/addresses', {
          method: 'POST',
          body: payload,
        });
      }
      onSuccess();
    } catch (err) {
      if (err instanceof ApiError) {
        onError(err.message);
      } else {
        onError('Failed to save address');
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="rounded-theme border border-line bg-surface p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-ink border-b border-line pb-3 mb-4">
        {initialData ? 'Edit Address' : 'Add New Address'}
      </h2>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Address Type Quick Selector */}
        <div className="space-y-1.5">
          <label className="block text-xs font-semibold text-ink-muted uppercase tracking-wider">Address Type</label>
          <div className="flex gap-2">
            {[
              { id: 'Home', label: 'Home', icon: Home },
              { id: 'Work', label: 'Work / Office', icon: Briefcase },
              { id: 'Other', label: 'Other', icon: Navigation },
            ].map((t) => {
              const Icon = t.icon;
              const isSelected = label === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setLabel(t.id)}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                    isSelected ? 'border-brand bg-brand/10 text-brand font-bold' : 'border-line text-ink-muted hover:border-ink hover:text-ink'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span>{t.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-medium text-ink">Recipient Full Name</label>
            <input
              type="text"
              required
              value={recipientName}
              onChange={(e) => setRecipientName(e.target.value)}
              className="mt-1 block h-9 w-full rounded-theme border border-line bg-surface-alt px-3 text-xs text-ink focus:border-brand focus:bg-surface focus:outline-none"
              placeholder="e.g. Rahul Sharma"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-ink">Phone Number</label>
            <input
              type="tel"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="mt-1 block h-9 w-full rounded-theme border border-line bg-surface-alt px-3 text-xs text-ink focus:border-brand focus:bg-surface focus:outline-none"
              placeholder="+91 98765 43210"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-ink">Flat / House No., Floor, Building Name</label>
          <input
            type="text"
            required
            value={addressLine1}
            onChange={(e) => setAddressLine1(e.target.value)}
            className="mt-1 block h-9 w-full rounded-theme border border-line bg-surface-alt px-3 text-xs text-ink focus:border-brand focus:bg-surface focus:outline-none"
            placeholder="Flat 402, Sunshine Heights, Main Road"
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-medium text-ink">Street / Area / Locality (Optional)</label>
            <input
              type="text"
              value={addressLine2}
              onChange={(e) => setAddressLine2(e.target.value)}
              className="mt-1 block h-9 w-full rounded-theme border border-line bg-surface-alt px-3 text-xs text-ink focus:border-brand focus:bg-surface focus:outline-none"
              placeholder="Near Metro Station"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-ink">Landmark (Optional)</label>
            <input
              type="text"
              value={landmark}
              onChange={(e) => setLandmark(e.target.value)}
              className="mt-1 block h-9 w-full rounded-theme border border-line bg-surface-alt px-3 text-xs text-ink focus:border-brand focus:bg-surface focus:outline-none"
              placeholder="Opposite City Mall"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className="block text-xs font-medium text-ink">PIN Code (Auto-Fills City/State)</label>
            <input
              type="text"
              required
              maxLength={6}
              value={postalCode}
              onChange={(e) => handlePincodeChange(e.target.value)}
              className="mt-1 block h-9 w-full rounded-theme border border-line bg-surface-alt px-3 font-mono text-xs text-ink focus:border-brand focus:bg-surface focus:outline-none"
              placeholder="e.g. 560001"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-ink">City</label>
            <input
              type="text"
              required
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className="mt-1 block h-9 w-full rounded-theme border border-line bg-surface-alt px-3 text-xs text-ink focus:border-brand focus:bg-surface focus:outline-none"
              placeholder="City"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-ink">State</label>
            <input
              type="text"
              required
              value={stateName}
              onChange={(e) => setStateName(e.target.value)}
              className="mt-1 block h-9 w-full rounded-theme border border-line bg-surface-alt px-3 text-xs text-ink focus:border-brand focus:bg-surface focus:outline-none"
              placeholder="State"
            />
          </div>
        </div>

        <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:gap-6">
          <label className="flex items-center gap-2 text-xs text-ink cursor-pointer">
            <input
              type="checkbox"
              checked={isDefaultShipping}
              onChange={(e) => setIsDefaultShipping(e.target.checked)}
              className="h-4 w-4 rounded border-line text-brand focus:ring-brand"
            />
            <span>Set as default shipping address</span>
          </label>
          <label className="flex items-center gap-2 text-xs text-ink cursor-pointer">
            <input
              type="checkbox"
              checked={isDefaultBilling}
              onChange={(e) => setIsDefaultBilling(e.target.checked)}
              className="h-4 w-4 rounded border-line text-brand focus:ring-brand"
            />
            <span>Set as default billing address</span>
          </label>
        </div>

        <div className="flex items-center gap-3 border-t border-line pt-4">
          <button
            type="submit"
            disabled={isSubmitting}
            className="inline-flex h-9 items-center justify-center rounded-theme bg-brand px-5 text-xs font-medium text-brand-foreground hover:bg-brand/90 disabled:opacity-50"
          >
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : initialData ? 'Save Changes' : 'Add Address'}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex h-9 items-center justify-center rounded-theme border border-line px-4 text-xs font-medium text-ink hover:bg-surface-alt"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
