'use client';

import { useState } from 'react';
import { 
  CreditCard, 
  Download, 
  Gift, 
  Plus, 
  Search, 
  Sparkles, 
  Copy, 
  Check, 
  Calendar, 
  Mail, 
  CheckCircle2 
} from 'lucide-react';
import { Alert, Badge, Button, Card, CardBody, CardHeader, Input, Select } from '@/components/ui/primitives';
import { useGiftCards, useIssueGiftCard } from '@/lib/queries/gift-cards';
import { minorStringToRupees, rupeesToMinorString } from '@/lib/money';
import type { GiftCardResponse, IssueGiftCardResponse } from '@ems/contracts';

const PRESET_AMOUNTS = ['500', '1000', '2500', '5000'];

export default function GiftCardsConsolePage() {
  const [page, setPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  
  // Issue Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [amount, setAmount] = useState('1000');
  const [recipientEmail, setRecipientEmail] = useState('');
  const [expiryOption, setExpiryOption] = useState('1_YEAR');
  const [issuedCard, setIssuedCard] = useState<IssueGiftCardResponse | null>(null);
  const [copied, setCopied] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const { data: giftCardsData, isLoading } = useGiftCards({
    page,
    limit: 25,
  });

  const issueGiftCard = useIssueGiftCard();

  const items: GiftCardResponse[] = giftCardsData?.data ?? [];

  // Filter items client-side for search/status
  const filteredItems = items.filter((item: GiftCardResponse) => {
    const matchesSearch =
      !searchQuery ||
      item.codeLast4.includes(searchQuery) ||
      (item.issuedToEmail && item.issuedToEmail.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesStatus = statusFilter === 'ALL' || item.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  // Calculate quick metrics
  const totalIssued = items.length;
  const activeCards = items.filter((c: GiftCardResponse) => c.status === 'ACTIVE').length;
  const totalBalanceMinor = items.reduce((sum: number, c: GiftCardResponse) => sum + Number(c.balance.amountMinor || 0), 0);
  const totalInitialMinor = items.reduce((sum: number, c: GiftCardResponse) => sum + Number(c.initialValue.amountMinor || 0), 0);

  async function handleIssue() {
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      setFeedback('Please enter a valid gift card amount in ₹.');
      return;
    }

    let expiresAt: string | undefined = undefined;
    if (expiryOption === '1_YEAR') {
      const d = new Date();
      d.setFullYear(d.getFullYear() + 1);
      expiresAt = d.toISOString();
    } else if (expiryOption === '2_YEARS') {
      const d = new Date();
      d.setFullYear(d.getFullYear() + 2);
      expiresAt = d.toISOString();
    }

    try {
      const result = await issueGiftCard.mutateAsync({
        amountMinor: rupeesToMinorString(amount),
        currency: 'INR',
        issuedToEmail: recipientEmail.trim() || undefined,
        expiresAt,
      });
      setIssuedCard(result);
    } catch (err: any) {
      setFeedback(err.message || 'Failed to issue gift card.');
    }
  }

  function copyCode(code: string) {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  function exportCsv() {
    const headers = ['ID', 'Code (Last 4)', 'Recipient Email', 'Initial (₹)', 'Balance (₹)', 'Status', 'Expires At', 'Created At'];
    const rows = filteredItems.map((c: GiftCardResponse) => [
      c.id,
      c.codeLast4,
      c.issuedToEmail || 'N/A',
      minorStringToRupees(c.initialValue.amountMinor),
      minorStringToRupees(c.balance.amountMinor),
      c.status,
      c.expiresAt ? new Date(c.expiresAt).toLocaleDateString() : 'Never',
      new Date(c.createdAt).toLocaleDateString(),
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r: any[]) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', 'gift_cards_' + new Date().toISOString().slice(0, 10) + '.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
            <Gift className="size-6 text-primary" />
            <span>Digital Gift Cards & Store Credit</span>
          </h1>
          <p className="text-sm text-muted-foreground">
            Issue, manage, and track customer gift cards, promotional vouchers, and customer care credits.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <Button variant="outline" size="sm" onClick={exportCsv}>
            <Download className="size-4 mr-1.5" />
            Export CSV
          </Button>
          <Button
            size="sm"
            onClick={() => {
              setIssuedCard(null);
              setRecipientEmail('');
              setAmount('1000');
              setModalOpen(true);
            }}
          >
            <Plus className="size-4 mr-1.5" />
            Issue Gift Card
          </Button>
        </div>
      </div>

      {feedback && (
        <Alert variant="info" className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="size-4 text-emerald-600" />
            <span>{feedback}</span>
          </div>
        </Alert>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4 bg-muted/20 border-border/70">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Total Issued Cards</span>
            <Gift className="size-4 text-primary" />
          </div>
          <div className="mt-2 text-2xl font-bold text-foreground">{totalIssued}</div>
          <p className="mt-1 text-xs text-muted-foreground">{activeCards} active with balance</p>
        </Card>

        <Card className="p-4 bg-muted/20 border-border/70">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Total Value Gifted</span>
            <CreditCard className="size-4 text-emerald-500" />
          </div>
          <div className="mt-2 text-2xl font-bold text-foreground">₹{minorStringToRupees(String(totalInitialMinor))}</div>
          <p className="mt-1 text-xs text-muted-foreground">Lifetime issued gift currency</p>
        </Card>

        <Card className="p-4 bg-muted/20 border-border/70">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Outstanding Balance</span>
            <Sparkles className="size-4 text-amber-500" />
          </div>
          <div className="mt-2 text-2xl font-bold text-amber-600">₹{minorStringToRupees(String(totalBalanceMinor))}</div>
          <p className="mt-1 text-xs text-muted-foreground">Unredeemed customer store credits</p>
        </Card>

        <Card className="p-4 bg-muted/20 border-border/70">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Redemption Rate</span>
            <CheckCircle2 className="size-4 text-primary" />
          </div>
          <div className="mt-2 text-2xl font-bold text-foreground">
            {totalInitialMinor > 0 ? Math.round(((totalInitialMinor - totalBalanceMinor) / totalInitialMinor) * 100) : 0}%
          </div>
          <p className="mt-1 text-xs text-emerald-600 font-medium">Applied towards store checkouts</p>
        </Card>
      </div>

      {/* Main Table */}
      <Card>
        <CardHeader
          title="Issued Gift Cards"
          description="View card status, remaining balances, and expiration details."
          action={
            <div className="flex items-center gap-2">
              <div className="relative w-64">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <Input
                  placeholder="Search last 4 digits, email..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 h-9 text-xs"
                />
              </div>
              <Select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="h-9 text-xs w-36"
              >
                <option value="ALL">All Statuses</option>
                <option value="ACTIVE">Active</option>
                <option value="DEPLETED">Depleted</option>
                <option value="EXPIRED">Expired</option>
                <option value="DISABLED">Disabled</option>
              </Select>
            </div>
          }
        />
        <CardBody className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-muted/40 border-b border-border/80 text-muted-foreground font-semibold uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4">Card Code</th>
                  <th className="py-3 px-4">Issued To</th>
                  <th className="py-3 px-4">Initial Value</th>
                  <th className="py-3 px-4">Current Balance</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Expires At</th>
                  <th className="py-3 px-4">Created Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {isLoading ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-muted-foreground">
                      Loading gift cards...
                    </td>
                  </tr>
                ) : filteredItems.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-muted-foreground">
                      No gift cards issued yet. Click &quot;Issue Gift Card&quot; to create your first digital card.
                    </td>
                  </tr>
                ) : (
                  filteredItems.map((card: GiftCardResponse) => (
                    <tr key={card.id} className="hover:bg-muted/20 transition-colors">
                      <td className="py-3.5 px-4 font-mono font-bold text-foreground">
                        •••• •••• •••• {card.codeLast4}
                      </td>
                      <td className="py-3.5 px-4 text-foreground">
                        {card.issuedToEmail ? (
                          <span className="flex items-center gap-1.5">
                            <Mail className="size-3 text-muted-foreground" />
                            {card.issuedToEmail}
                          </span>
                        ) : (
                          <span className="text-muted-foreground italic">Direct / Walk-in</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 font-semibold text-foreground">
                        ₹{minorStringToRupees(card.initialValue.amountMinor)}
                      </td>
                      <td className="py-3.5 px-4 font-bold text-emerald-600">
                        ₹{minorStringToRupees(card.balance.amountMinor)}
                      </td>
                      <td className="py-3.5 px-4">
                        {card.status === 'ACTIVE' && (
                          <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 text-emerald-600 font-medium">
                            Active
                          </Badge>
                        )}
                        {card.status === 'DEPLETED' && (
                          <Badge variant="outline" className="border-border text-muted-foreground font-medium">
                            Depleted (₹0)
                          </Badge>
                        )}
                        {card.status === 'EXPIRED' && (
                          <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-amber-600 font-medium">
                            Expired
                          </Badge>
                        )}
                        {card.status === 'DISABLED' && (
                          <Badge variant="outline" className="border-rose-500/40 bg-rose-500/10 text-rose-600 font-medium">
                            Disabled
                          </Badge>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-muted-foreground">
                        {card.expiresAt ? (
                          <div className="flex items-center gap-1">
                            <Calendar className="size-3" />
                            <span>{new Date(card.expiresAt).toLocaleDateString()}</span>
                          </div>
                        ) : (
                          <span>Never</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-muted-foreground">
                        {new Date(card.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>

      {/* Issue Gift Card Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-xl border border-border bg-surface p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                <Gift className="size-5 text-primary" />
                {issuedCard ? 'Gift Card Issued Successfully!' : 'Issue Digital Gift Card'}
              </h2>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="text-muted-foreground hover:text-foreground text-sm font-semibold"
              >
                ✕
              </button>
            </div>

            {issuedCard ? (
              <div className="space-y-4">
                <Alert variant="info" className="flex flex-col gap-2">
                  <div className="flex items-center gap-2 text-foreground font-semibold">
                    <Sparkles className="size-4 text-primary" />
                    <span>One-Time Raw Gift Card Code</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    For security, this complete 16-character gift card code is displayed only once. Please copy and share it with the customer immediately.
                  </p>
                </Alert>

                <div className="p-4 rounded-xl bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border border-primary/30 text-center space-y-2">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
                    Digital Gift Voucher
                  </span>
                  <div className="text-xl font-mono font-bold tracking-wider text-primary select-all">
                    {issuedCard.code}
                  </div>
                  <div className="text-sm font-semibold text-foreground">
                    Value: ₹{minorStringToRupees(issuedCard.balance.amountMinor)}
                  </div>
                  {issuedCard.expiresAt && (
                    <div className="text-xs text-muted-foreground">
                      Expires: {new Date(issuedCard.expiresAt).toLocaleDateString()}
                    </div>
                  )}
                </div>

                <div className="flex justify-center">
                  <Button
                    onClick={() => copyCode(issuedCard.code)}
                    className="w-full"
                  >
                    {copied ? (
                      <>
                        <Check className="size-4 mr-1.5 text-emerald-400" />
                        Copied to Clipboard!
                      </>
                    ) : (
                      <>
                        <Copy className="size-4 mr-1.5" />
                        Copy Gift Card Code
                      </>
                    )}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4 text-sm">
                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1.5">
                    Select Denomination (₹)
                  </label>
                  <div className="grid grid-cols-4 gap-2 mb-2">
                    {PRESET_AMOUNTS.map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setAmount(p)}
                        className={'p-2.5 rounded-lg border text-xs font-bold transition ' + (
                          amount === p
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-border bg-muted/20 hover:border-primary/50 text-foreground'
                        )}
                      >
                        ₹{p}
                      </button>
                    ))}
                  </div>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground">
                      ₹
                    </span>
                    <Input
                      type="number"
                      placeholder="Custom Amount"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      className="pl-7"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1">
                    Customer Recipient Email (Optional)
                  </label>
                  <Input
                    type="email"
                    placeholder="customer@example.com"
                    value={recipientEmail}
                    onChange={(e) => setRecipientEmail(e.target.value)}
                  />
                  <p className="text-[11px] text-muted-foreground mt-1">
                    If provided, the gift card will be attached to their customer account profile.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1">
                    Card Validity / Expiration
                  </label>
                  <Select
                    value={expiryOption}
                    onChange={(e) => setExpiryOption(e.target.value)}
                  >
                    <option value="1_YEAR">Valid for 1 Year (Recommended)</option>
                    <option value="2_YEARS">Valid for 2 Years</option>
                    <option value="NEVER">Never Expires (Lifetime Credit)</option>
                  </Select>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <Button variant="outline" onClick={() => setModalOpen(false)}>
                {issuedCard ? 'Close' : 'Cancel'}
              </Button>
              {!issuedCard && (
                <Button
                  loading={issueGiftCard.isPending}
                  onClick={handleIssue}
                >
                  Issue Card Now
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
