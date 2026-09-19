'use client';

import { useState } from 'react';
import { 
  AlertCircle, 
  ArrowUpRight, 
  Clock, 
  Copy, 
  Download, 
  Mail, 
  RefreshCw, 
  Search, 
  Send, 
  ShoppingCart, 
  Sparkles, 
  Tag, 
  User, 
  CheckCircle2,
  Settings
} from 'lucide-react';
import { Alert, Badge, Button, Card, CardBody, CardHeader, Input, Select } from '@/components/ui/primitives';

interface AbandonedCartItem {
  id: string;
  name: string;
  sku: string;
  price: number;
  qty: number;
  image?: string;
}

interface AbandonedCart {
  id: string;
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  items: AbandonedCartItem[];
  subtotal: number;
  currency: string;
  abandonedAt: string;
  status: 'PENDING' | 'EMAIL_SENT' | 'RECOVERED' | 'EXPIRED';
  recoveryAttempts: number;
  lastEmailAt?: string;
  recoveryUrl: string;
}

const INITIAL_CARTS: AbandonedCart[] = [
  {
    id: 'cart_8912',
    customerName: 'Aarav Sharma',
    customerEmail: 'aarav.sharma@example.com',
    customerPhone: '+91 98765 43210',
    items: [
      { id: 'i1', name: 'Premium Leather Oxford Shoes', sku: 'SHOE-OXF-42', price: 4499, qty: 1 },
      { id: 'i2', name: 'Classic Silk Necktie (Navy)', sku: 'TIE-SLK-NVY', price: 899, qty: 1 },
    ],
    subtotal: 5398,
    currency: 'INR',
    abandonedAt: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
    status: 'PENDING',
    recoveryAttempts: 0,
    recoveryUrl: 'https://store.example.com/checkout?recover=cart_8912&token=tok_910a',
  },
  {
    id: 'cart_8907',
    customerName: 'Priya Mukherjee',
    customerEmail: 'priya.m@techcorp.in',
    customerPhone: '+91 91234 56789',
    items: [
      { id: 'i3', name: 'Ceramic Pour-over Coffee Dripper', sku: 'COF-DRP-WHT', price: 1299, qty: 2 },
      { id: 'i4', name: 'Organic Colombian Whole Beans (500g)', sku: 'BN-COL-500', price: 750, qty: 2 },
    ],
    subtotal: 4098,
    currency: 'INR',
    abandonedAt: new Date(Date.now() - 3 * 3600 * 1000).toISOString(),
    status: 'EMAIL_SENT',
    recoveryAttempts: 1,
    lastEmailAt: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
    recoveryUrl: 'https://store.example.com/checkout?recover=cart_8907&token=tok_412b',
  },
  {
    id: 'cart_8894',
    customerName: 'Rohit Verma',
    customerEmail: 'rohit.v@gmail.com',
    items: [
      { id: 'i5', name: 'Ergonomic Desk Mat (Midnight Blue)', sku: 'MAT-MID-01', price: 1499, qty: 1 },
    ],
    subtotal: 1499,
    currency: 'INR',
    abandonedAt: new Date(Date.now() - 14 * 3600 * 1000).toISOString(),
    status: 'RECOVERED',
    recoveryAttempts: 1,
    lastEmailAt: new Date(Date.now() - 13 * 3600 * 1000).toISOString(),
    recoveryUrl: 'https://store.example.com/checkout?recover=cart_8894&token=tok_781c',
  },
  {
    id: 'cart_8872',
    customerName: 'Sneha Patel',
    customerEmail: 'sneha.patel@designstudio.io',
    customerPhone: '+91 99887 76655',
    items: [
      { id: 'i6', name: 'Wireless Mechanical Keyboard', sku: 'KB-MEC-RGB', price: 6999, qty: 1 },
      { id: 'i7', name: 'Custom Keycap Set (Retro)', sku: 'KCAP-RET-108', price: 1999, qty: 1 },
    ],
    subtotal: 8998,
    currency: 'INR',
    abandonedAt: new Date(Date.now() - 28 * 3600 * 1000).toISOString(),
    status: 'EMAIL_SENT',
    recoveryAttempts: 2,
    lastEmailAt: new Date(Date.now() - 4 * 3600 * 1000).toISOString(),
    recoveryUrl: 'https://store.example.com/checkout?recover=cart_8872&token=tok_339d',
  },
  {
    id: 'cart_8830',
    customerName: 'Vikramaditya Rao',
    customerEmail: 'vikram.rao@enterprise.co',
    items: [
      { id: 'i8', name: 'Ultra-thin Laptop Sleeve (14-inch)', sku: 'SLV-LTH-14', price: 2199, qty: 1 },
    ],
    subtotal: 2199,
    currency: 'INR',
    abandonedAt: new Date(Date.now() - 72 * 3600 * 1000).toISOString(),
    status: 'EXPIRED',
    recoveryAttempts: 2,
    lastEmailAt: new Date(Date.now() - 48 * 3600 * 1000).toISOString(),
    recoveryUrl: 'https://store.example.com/checkout?recover=cart_8830&token=tok_991e',
  },
];

export default function AbandonedCartsPage() {
  const [carts, setCarts] = useState<AbandonedCart[]>(INITIAL_CARTS);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING' | 'EMAIL_SENT' | 'RECOVERED' | 'EXPIRED'>('ALL');
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);
  const [couponCode, setCouponCode] = useState('RECOVER10');
  const [autoEmailEnabled, setAutoEmailEnabled] = useState(true);
  const [showSettingsModal, setShowSettingsModal] = useState(false);

  const totalAbandonedValue = carts.reduce((sum, c) => sum + c.subtotal, 0);
  const recoveredCarts = carts.filter((c) => c.status === 'RECOVERED');
  const recoveredValue = recoveredCarts.reduce((sum, c) => sum + c.subtotal, 0);
  const recoveryRate = Math.round((recoveredCarts.length / carts.length) * 100);

  const filteredCarts = carts.filter((cart) => {
    const matchesSearch =
      cart.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      cart.customerEmail.toLowerCase().includes(searchQuery.toLowerCase()) ||
      cart.id.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'ALL' || cart.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  function handleSendRecoveryEmail(cart: AbandonedCart) {
    setCarts((prev) =>
      prev.map((c) =>
        c.id === cart.id
          ? {
              ...c,
              status: 'EMAIL_SENT',
              recoveryAttempts: c.recoveryAttempts + 1,
              lastEmailAt: new Date().toISOString(),
            }
          : c,
      ),
    );
    setActionFeedback('Recovery email with ' + couponCode + ' (10% OFF) sent to ' + cart.customerEmail + '!');
    setTimeout(() => setActionFeedback(null), 4000);
  }

  function handleMarkRecovered(cartId: string) {
    setCarts((prev) =>
      prev.map((c) => (c.id === cartId ? { ...c, status: 'RECOVERED' } : c)),
    );
    setActionFeedback('Cart #' + cartId + ' marked as recovered order!');
    setTimeout(() => setActionFeedback(null), 4000);
  }

  function copyRecoveryLink(url: string) {
    navigator.clipboard.writeText(url);
    setActionFeedback('Direct recovery checkout link copied to clipboard!');
    setTimeout(() => setActionFeedback(null), 3000);
  }

  function exportCsv() {
    const headers = ['Cart ID', 'Customer Name', 'Customer Email', 'Subtotal', 'Status', 'Abandoned At', 'Recovery Attempts'];
    const rows = filteredCarts.map((c) => [
      c.id,
      '"' + c.customerName + '"',
      c.customerEmail,
      c.subtotal,
      c.status,
      c.abandonedAt,
      c.recoveryAttempts,
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', 'abandoned_carts_' + new Date().toISOString().slice(0, 10) + '.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Abandoned Carts Recovery</h1>
          <p className="text-sm text-muted-foreground">
            Track uncompleted checkouts and automatically re-engage shoppers with customized recovery discounts.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <Button variant="outline" size="sm" onClick={() => setShowSettingsModal(true)}>
            <Settings className="size-4 mr-1.5" />
            Automation Settings
          </Button>
          <Button variant="outline" size="sm" onClick={exportCsv}>
            <Download className="size-4 mr-1.5" />
            Export CSV
          </Button>
        </div>
      </div>

      {actionFeedback && (
        <Alert variant="info" className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="size-4 text-emerald-600" />
            <span>{actionFeedback}</span>
          </div>
        </Alert>
      )}

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4 bg-muted/20 border-border/70">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Abandoned Revenue</span>
            <ShoppingCart className="size-4 text-amber-500" />
          </div>
          <div className="mt-2 text-2xl font-bold text-foreground">₹{totalAbandonedValue.toLocaleString('en-IN')}</div>
          <p className="mt-1 text-xs text-muted-foreground">{carts.length} total abandoned checkouts</p>
        </Card>

        <Card className="p-4 bg-muted/20 border-border/70">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Recovered Revenue</span>
            <Sparkles className="size-4 text-emerald-500" />
          </div>
          <div className="mt-2 text-2xl font-bold text-emerald-600">₹{recoveredValue.toLocaleString('en-IN')}</div>
          <p className="mt-1 text-xs text-muted-foreground">{recoveredCarts.length} successfully recovered orders</p>
        </Card>

        <Card className="p-4 bg-muted/20 border-border/70">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Recovery Rate</span>
            <ArrowUpRight className="size-4 text-primary" />
          </div>
          <div className="mt-2 text-2xl font-bold text-foreground">{recoveryRate}%</div>
          <p className="mt-1 text-xs text-emerald-600 font-medium">Industry Benchmark: 12-18%</p>
        </Card>

        <Card className="p-4 bg-muted/20 border-border/70">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Automation Status</span>
            <Mail className="size-4 text-primary" />
          </div>
          <div className="mt-2 flex items-center gap-2">
            <span className="text-xl font-bold text-foreground">{autoEmailEnabled ? 'Active' : 'Paused'}</span>
            <span className="inline-block size-2 rounded-full bg-emerald-500 animate-pulse" />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">1h, 24h & 48h scheduled sequences</p>
        </Card>
      </div>

      {/* Main Table Card */}
      <Card>
        <CardHeader
          title="Abandoned Carts"
          description="View and recover shoppers who initiated checkout without placing the order."
          action={
            <div className="flex items-center gap-2">
              <div className="relative w-64">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <Input
                  placeholder="Search customer, email..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 h-9 text-xs"
                />
              </div>
              <Select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                className="h-9 text-xs w-40"
              >
                <option value="ALL">All Statuses</option>
                <option value="PENDING">Pending Email</option>
                <option value="EMAIL_SENT">Email Sent</option>
                <option value="RECOVERED">Recovered</option>
                <option value="EXPIRED">Expired</option>
              </Select>
            </div>
          }
        />
        <CardBody className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-muted/40 border-b border-border/80 text-muted-foreground font-semibold uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4">Cart Details</th>
                  <th className="py-3 px-4">Customer</th>
                  <th className="py-3 px-4">Cart Items</th>
                  <th className="py-3 px-4">Value</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Abandoned</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {filteredCarts.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-muted-foreground">
                      No abandoned carts found matching your filter criteria.
                    </td>
                  </tr>
                ) : (
                  filteredCarts.map((cart) => (
                    <tr key={cart.id} className="hover:bg-muted/20 transition-colors">
                      <td className="py-3.5 px-4 font-mono font-medium text-foreground">
                        {cart.id}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-medium text-foreground">{cart.customerName}</div>
                        <div className="text-muted-foreground">{cart.customerEmail}</div>
                        {cart.customerPhone && (
                          <div className="text-[11px] text-muted-foreground/80">{cart.customerPhone}</div>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="space-y-1">
                          {cart.items.map((item) => (
                            <div key={item.id} className="flex items-center gap-1.5 text-foreground">
                              <span className="font-semibold text-primary">{item.qty}x</span>
                              <span className="truncate max-w-[200px]">{item.name}</span>
                            </div>
                          ))}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 font-semibold text-foreground">
                        ₹{cart.subtotal.toLocaleString('en-IN')}
                      </td>
                      <td className="py-3.5 px-4">
                        {cart.status === 'PENDING' && (
                          <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-amber-600 font-medium">
                            Pending Email
                          </Badge>
                        )}
                        {cart.status === 'EMAIL_SENT' && (
                          <Badge variant="outline" className="border-primary/40 bg-primary/10 text-primary font-medium">
                            Email Sent ({cart.recoveryAttempts}x)
                          </Badge>
                        )}
                        {cart.status === 'RECOVERED' && (
                          <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 text-emerald-600 font-medium">
                            Recovered
                          </Badge>
                        )}
                        {cart.status === 'EXPIRED' && (
                          <Badge variant="outline" className="border-border text-muted-foreground font-medium">
                            Expired
                          </Badge>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-muted-foreground whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          <Clock className="size-3" />
                          <span>{new Date(cart.abandonedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                        <div className="text-[10px]">{new Date(cart.abandonedAt).toLocaleDateString()}</div>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            title="Copy Direct Recovery Link"
                            onClick={() => copyRecoveryLink(cart.recoveryUrl)}
                          >
                            <Copy className="size-3.5 mr-1" />
                            Link
                          </Button>
                          {cart.status !== 'RECOVERED' && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 px-2.5 text-xs text-primary font-medium"
                              onClick={() => handleSendRecoveryEmail(cart)}
                            >
                              <Send className="size-3 mr-1" />
                              Send Email
                            </Button>
                          )}
                          {cart.status !== 'RECOVERED' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs text-emerald-600 hover:text-emerald-700"
                              title="Mark as Recovered"
                              onClick={() => handleMarkRecovered(cart.id)}
                            >
                              Mark Won
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>

      {/* Settings Modal */}
      {showSettingsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-xl border border-border bg-surface p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                <Settings className="size-5 text-primary" />
                Automated Recovery Configuration
              </h2>
              <button
                type="button"
                onClick={() => setShowSettingsModal(false)}
                className="text-muted-foreground hover:text-foreground text-sm font-semibold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 text-sm">
              <label className="flex items-center justify-between p-3 rounded-lg border border-border/80 bg-muted/20 cursor-pointer">
                <div>
                  <div className="font-semibold text-foreground">Enable Scheduled Drip Sequence</div>
                  <div className="text-xs text-muted-foreground">
                    Automatically triggers recovery emails at 1hr, 24hrs, and 48hrs after cart abandonment.
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={autoEmailEnabled}
                  onChange={(e) => setAutoEmailEnabled(e.target.checked)}
                  className="size-5 text-primary rounded"
                />
              </label>

              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">
                  Default Recovery Discount Coupon Code
                </label>
                <div className="flex gap-2">
                  <Input
                    value={couponCode}
                    onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                    className="font-mono uppercase font-bold"
                  />
                  <Badge variant="outline" className="text-xs shrink-0 self-center">
                    10% Instant Off
                  </Badge>
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">
                  This coupon code is automatically embedded inside the customer recovery link.
                </p>
              </div>

              <div className="p-3.5 rounded-lg bg-primary/5 border border-primary/20 space-y-2">
                <span className="text-xs font-semibold text-primary uppercase tracking-wider">
                  Automated Sequence Schedule
                </span>
                <ul className="text-xs space-y-1 text-muted-foreground">
                  <li>• <strong>Step 1 (1 hour):</strong> Friendly reminder with direct cart link.</li>
                  <li>• <strong>Step 2 (24 hours):</strong> Special 10% incentive voucher ({couponCode}).</li>
                  <li>• <strong>Step 3 (48 hours):</strong> Final scarcity notice before cart reservation expires.</li>
                </ul>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <Button variant="outline" onClick={() => setShowSettingsModal(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => {
                  setShowSettingsModal(false);
                  setActionFeedback('Automated recovery settings saved successfully!');
                  setTimeout(() => setActionFeedback(null), 3000);
                }}
              >
                Save Settings
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
