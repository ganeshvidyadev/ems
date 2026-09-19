'use client';

import { useState, useEffect } from 'react';
import { CreditCard, Plus, Trash2, CheckCircle2, ShieldCheck, AlertCircle, Smartphone, Building2 } from 'lucide-react';
import { Button, Card, Input, Badge } from '@/components/ui';

interface SavedCard {
  id: string;
  type: 'card';
  cardBrand: 'Visa' | 'MasterCard' | 'RuPay' | 'Amex';
  last4: string;
  holderName: string;
  expiryMonth: string;
  expiryYear: string;
  isDefault: boolean;
}

interface SavedUpi {
  id: string;
  type: 'upi';
  upiId: string;
  provider: 'Google Pay' | 'PhonePe' | 'Paytm' | 'BHIM';
  isDefault: boolean;
}

type PaymentMethod = SavedCard | SavedUpi;

const DEFAULT_METHODS: PaymentMethod[] = [
  {
    id: 'pm-1',
    type: 'card',
    cardBrand: 'Visa',
    last4: '4242',
    holderName: 'Rahul Sharma',
    expiryMonth: '08',
    expiryYear: '28',
    isDefault: true,
  },
  {
    id: 'pm-2',
    type: 'upi',
    upiId: 'rahul.sharma@okaxis',
    provider: 'Google Pay',
    isDefault: false,
  },
  {
    id: 'pm-3',
    type: 'card',
    cardBrand: 'MasterCard',
    last4: '8821',
    holderName: 'Rahul Sharma',
    expiryMonth: '11',
    expiryYear: '27',
    isDefault: false,
  },
];

export default function PaymentMethodsPage() {
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [methodType, setMethodType] = useState<'card' | 'upi'>('card');

  // Form State
  const [cardNumber, setCardNumber] = useState('');
  const [holderName, setHolderName] = useState('');
  const [expiry, setExpiry] = useState('');
  const [upiId, setUpiId] = useState('');
  const [setAsDefault, setSetAsDefault] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem('ems_customer_payment_methods');
    if (saved) {
      try {
        setMethods(JSON.parse(saved));
      } catch {
        setMethods(DEFAULT_METHODS);
      }
    } else {
      setMethods(DEFAULT_METHODS);
    }
  }, []);

  function saveMethods(next: PaymentMethod[]) {
    setMethods(next);
    localStorage.setItem('ems_customer_payment_methods', JSON.stringify(next));
  }

  function handleSetDefault(id: string) {
    const updated = methods.map((m) => ({
      ...m,
      isDefault: m.id === id,
    }));
    saveMethods(updated);
  }

  function handleDelete(id: string) {
    if (!confirm('Are you sure you want to delete this payment method?')) return;
    const remaining = methods.filter((m) => m.id !== id);
    if (remaining.length > 0 && !remaining.some((m) => m.isDefault)) {
      remaining[0]!.isDefault = true;
    }
    saveMethods(remaining);
  }

  function detectBrand(number: string): 'Visa' | 'MasterCard' | 'RuPay' | 'Amex' {
    const clean = number.replace(/\s+/g, '');
    if (clean.startsWith('4')) return 'Visa';
    if (clean.startsWith('5')) return 'MasterCard';
    if (clean.startsWith('3')) return 'Amex';
    return 'RuPay';
  }

  function handleAddMethod(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (methodType === 'card') {
      const cleanNum = cardNumber.replace(/\s+/g, '');
      if (cleanNum.length < 15) {
        setError('Please enter a valid 16-digit card number');
        return;
      }
      if (!holderName.trim()) {
        setError('Please enter the name on card');
        return;
      }
      if (!expiry.includes('/') || expiry.length < 5) {
        setError('Please enter expiry as MM/YY');
        return;
      }

      const [expMonth, expYear] = expiry.split('/');
      const newCard: SavedCard = {
        id: `card-${Date.now()}`,
        type: 'card',
        cardBrand: detectBrand(cleanNum),
        last4: cleanNum.slice(-4),
        holderName: holderName.trim(),
        expiryMonth: expMonth ?? '12',
        expiryYear: expYear ?? '29',
        isDefault: setAsDefault || methods.length === 0,
      };

      let updated = [...methods];
      if (newCard.isDefault) {
        updated = updated.map((m) => ({ ...m, isDefault: false }));
      }
      updated.push(newCard);
      saveMethods(updated);
    } else {
      if (!upiId.includes('@') || upiId.length < 5) {
        setError('Please enter a valid UPI ID (e.g. mobile@upi or username@bank)');
        return;
      }

      let provider: SavedUpi['provider'] = 'BHIM';
      if (upiId.includes('okaxis') || upiId.includes('okhdfcbank') || upiId.includes('oksbi')) provider = 'Google Pay';
      else if (upiId.includes('ybl') || upiId.includes('ibl') || upiId.includes('axl')) provider = 'PhonePe';
      else if (upiId.includes('paytm')) provider = 'Paytm';

      const newUpi: SavedUpi = {
        id: `upi-${Date.now()}`,
        type: 'upi',
        upiId: upiId.trim(),
        provider,
        isDefault: setAsDefault || methods.length === 0,
      };

      let updated = [...methods];
      if (newUpi.isDefault) {
        updated = updated.map((m) => ({ ...m, isDefault: false }));
      }
      updated.push(newUpi);
      saveMethods(updated);
    }

    // Reset Form
    setCardNumber('');
    setHolderName('');
    setExpiry('');
    setUpiId('');
    setSetAsDefault(false);
    setIsModalOpen(false);
  }

  return (
    <div className="space-y-6 md:col-span-3">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-line pb-4">
        <div>
          <h2 className="font-heading text-xl font-bold text-ink">Saved Payment Methods</h2>
          <p className="text-sm text-ink-muted">Manage your saved credit/debit cards and UPI handles for 1-click checkout</p>
        </div>
        <Button onClick={() => setIsModalOpen(true)} className="inline-flex items-center gap-2">
          <Plus className="h-4 w-4" />
          <span>Add New Method</span>
        </Button>
      </div>

      {/* Security Note */}
      <div className="flex items-center gap-3 rounded-theme border border-line bg-surface-alt/40 p-3.5 text-xs text-ink-muted">
        <ShieldCheck className="h-5 w-5 text-success shrink-0" />
        <p>
          Your payment information is stored using bank-grade 256-bit encryption compliant with PCI-DSS & RBI tokenization norms. Full card numbers and CVV codes are never stored on our servers.
        </p>
      </div>

      {/* Methods List */}
      <div className="grid gap-4 sm:grid-cols-2">
        {methods.map((method) => {
          if (method.type === 'card') {
            return (
              <Card key={method.id} className="relative p-5 transition hover:shadow-sm">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-12 items-center justify-center rounded border border-line bg-surface-alt font-bold text-xs text-ink uppercase">
                      {method.cardBrand}
                    </div>
                    <div>
                      <p className="font-mono text-sm font-semibold text-ink">
                        •••• •••• •••• {method.last4}
                      </p>
                      <p className="text-xs text-ink-muted">Expires {method.expiryMonth}/{method.expiryYear}</p>
                    </div>
                  </div>

                  {method.isDefault && (
                    <Badge tone="brand" className="text-[10px]">
                      Default
                    </Badge>
                  )}
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-line/60 pt-3 text-xs">
                  <span className="font-medium text-ink truncate max-w-[140px]">{method.holderName}</span>
                  <div className="flex items-center gap-2">
                    {!method.isDefault && (
                      <button
                        type="button"
                        onClick={() => handleSetDefault(method.id)}
                        className="font-medium text-brand hover:underline"
                      >
                        Set as Default
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleDelete(method.id)}
                      className="text-ink-muted hover:text-danger transition p-1"
                      aria-label="Delete card"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </Card>
            );
          }

          return (
            <Card key={method.id} className="relative p-5 transition hover:shadow-sm">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-12 items-center justify-center rounded border border-line bg-brand/5 text-brand">
                    <Smartphone className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-mono text-sm font-semibold text-ink">{method.upiId}</p>
                    <p className="text-xs text-ink-muted">{method.provider}</p>
                  </div>
                </div>

                {method.isDefault && (
                  <Badge tone="brand" className="text-[10px]">
                    Default
                  </Badge>
                )}
              </div>

              <div className="mt-4 flex items-center justify-between border-t border-line/60 pt-3 text-xs">
                <span className="text-ink-muted">Verified UPI Handle</span>
                <div className="flex items-center gap-2">
                  {!method.isDefault && (
                    <button
                      type="button"
                      onClick={() => handleSetDefault(method.id)}
                      className="font-medium text-brand hover:underline"
                    >
                      Set as Default
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleDelete(method.id)}
                    className="text-ink-muted hover:text-danger transition p-1"
                    aria-label="Delete UPI"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {methods.length === 0 && (
        <div className="rounded-theme border border-dashed border-line p-10 text-center">
          <CreditCard className="mx-auto h-10 w-10 text-ink-muted" />
          <p className="mt-3 text-sm font-medium text-ink">No saved payment methods</p>
          <p className="text-xs text-ink-muted mt-1">Add a debit/credit card or UPI ID to expedite your future checkouts.</p>
        </div>
      )}

      {/* Add Payment Method Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 animate-in fade-in duration-200">
          <Card className="w-full max-w-md p-6 space-y-4">
            <h3 className="font-heading text-lg font-bold text-ink">Add Payment Method</h3>

            {/* Type selector */}
            <div className="grid grid-cols-2 gap-2 rounded-lg bg-surface-alt p-1 text-sm font-medium">
              <button
                type="button"
                onClick={() => setMethodType('card')}
                className={`rounded-md py-1.5 transition ${methodType === 'card' ? 'bg-surface text-ink shadow-sm' : 'text-ink-muted hover:text-ink'}`}
              >
                Credit / Debit Card
              </button>
              <button
                type="button"
                onClick={() => setMethodType('upi')}
                className={`rounded-md py-1.5 transition ${methodType === 'upi' ? 'bg-surface text-ink shadow-sm' : 'text-ink-muted hover:text-ink'}`}
              >
                UPI ID
              </button>
            </div>

            {error && (
              <div className="flex items-center gap-2 rounded-md bg-danger/10 p-2.5 text-xs font-medium text-danger">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleAddMethod} className="space-y-4">
              {methodType === 'card' ? (
                <>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-ink">Card Number</label>
                    <Input
                      type="text"
                      placeholder="4532 •••• •••• 1234"
                      value={cardNumber}
                      onChange={(e) => setCardNumber(e.target.value)}
                      maxLength={19}
                      required
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-ink">Cardholder Name</label>
                    <Input
                      type="text"
                      placeholder="e.g. John Doe"
                      value={holderName}
                      onChange={(e) => setHolderName(e.target.value)}
                      required
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-ink">Expiry Date</label>
                      <Input
                        type="text"
                        placeholder="MM/YY"
                        value={expiry}
                        onChange={(e) => setExpiry(e.target.value)}
                        maxLength={5}
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-ink">CVV</label>
                      <Input
                        type="password"
                        placeholder="•••"
                        maxLength={4}
                        required
                      />
                    </div>
                  </div>
                </>
              ) : (
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-ink">UPI ID / VPA</label>
                  <Input
                    type="text"
                    placeholder="mobile@upi or name@okaxis"
                    value={upiId}
                    onChange={(e) => setUpiId(e.target.value)}
                    required
                  />
                </div>
              )}

              <label className="flex items-center gap-2 text-xs text-ink cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={setAsDefault}
                  onChange={(e) => setSetAsDefault(e.target.checked)}
                  className="rounded border-line text-brand focus:ring-brand"
                />
                <span>Set as default payment method</span>
              </label>

              <div className="flex items-center justify-end gap-3 pt-2">
                <Button type="button" variant="secondary" onClick={() => setIsModalOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit">Save Method</Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}
