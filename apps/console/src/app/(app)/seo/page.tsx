'use client';

import { useState } from 'react';
import { Globe, Search, Share2, Twitter, Code, Check, Copy, Sparkles, Shield, AlertCircle, RefreshCw } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';

export default function SeoSettingsPage() {
  const { user } = useAuth();

  // Form State
  const [storeName, setStoreName] = useState('Aura Botanics');
  const [metaTitle, setMetaTitle] = useState('Aura Botanics · Organic Skincare, Cold-Pressed Oils & Natural Wellness');
  const [metaDescription, setMetaDescription] = useState('Shop premium certified organic skincare, cold-pressed almond and argan oils, and pure botanicals crafted for natural radiance. Free shipping across India on orders above ₹999.');
  const [domain, setDomain] = useState('store.aurabotanics.com');
  const [ogImageUrl, setOgImageUrl] = useState('https://images.unsplash.com/photo-1556228720-195a672e8a03?w=1200&auto=format&fit=crop&q=80');
  const [twitterHandle, setTwitterHandle] = useState('@aurabotanics');
  const [robotsIndex, setRobotsIndex] = useState(true);
  const [copiedSchema, setCopiedSchema] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  const titleLength = metaTitle.length;
  const descLength = metaDescription.length;

  const jsonLdSchema = {
    '@context': 'https://schema.org',
    '@type': 'OnlineStore',
    name: storeName,
    url: `https://${domain}`,
    description: metaDescription,
    image: ogImageUrl,
    sameAs: [
      `https://twitter.com/${twitterHandle.replace('@', '')}`,
      `https://instagram.com/${storeName.toLowerCase().replace(/\s+/g, '')}`,
    ],
    potentialAction: {
      '@type': 'SearchAction',
      target: `https://${domain}/products?q={search_term_string}`,
      'query-input': 'required name=search_term_string',
    },
  };

  const schemaString = JSON.stringify(jsonLdSchema, null, 2);

  function handleCopySchema() {
    navigator.clipboard.writeText(schemaString);
    setCopiedSchema(true);
    setTimeout(() => setCopiedSchema(false), 2000);
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
  }

  return (
    <main className="mx-auto max-w-6xl px-6 py-8 space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Search Engine & Social Optimization (SEO)</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Configure metadata, OpenGraph cards, Twitter preview cards, and Schema.org structured data.
          </p>
        </div>

        <button
          onClick={handleSave}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow hover:opacity-90 transition"
        >
          {savedSuccess ? <Check className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
          <span>{savedSuccess ? 'SEO Settings Saved!' : 'Save SEO Settings'}</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Form Settings */}
        <div className="lg:col-span-6 space-y-6">
          <form onSubmit={handleSave} className="rounded-2xl border bg-card p-6 shadow-sm space-y-5 text-xs">
            <h2 className="text-sm font-bold text-foreground">Metadata Configuration</h2>

            <div className="space-y-1.5">
              <label className="font-semibold text-foreground">Store Display Name</label>
              <input
                type="text"
                value={storeName}
                onChange={(e) => setStoreName(e.target.value)}
                className="w-full rounded-lg border bg-background px-3 py-2 text-xs text-foreground focus:border-primary focus:outline-none"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="font-semibold text-foreground">Meta Title (Page Title)</label>
                <span className={`font-mono text-[11px] ${titleLength > 60 ? 'text-amber-600 font-bold' : 'text-muted-foreground'}`}>
                  {titleLength} / 60 chars
                </span>
              </div>
              <input
                type="text"
                value={metaTitle}
                onChange={(e) => setMetaTitle(e.target.value)}
                className="w-full rounded-lg border bg-background px-3 py-2 text-xs text-foreground focus:border-primary focus:outline-none"
              />
              {titleLength > 60 && (
                <p className="text-[10px] text-amber-600">
                  Google typically truncates titles over 60 characters in search results.
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="font-semibold text-foreground">Meta Description</label>
                <span className={`font-mono text-[11px] ${descLength > 160 ? 'text-amber-600 font-bold' : 'text-muted-foreground'}`}>
                  {descLength} / 160 chars
                </span>
              </div>
              <textarea
                rows={3}
                value={metaDescription}
                onChange={(e) => setMetaDescription(e.target.value)}
                className="w-full rounded-lg border bg-background px-3 py-2 text-xs text-foreground focus:border-primary focus:outline-none leading-relaxed"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="font-semibold text-foreground">Canonical Domain</label>
                <input
                  type="text"
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                  className="w-full rounded-lg border bg-background px-3 py-2 text-xs font-mono text-foreground focus:border-primary focus:outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="font-semibold text-foreground">Twitter / X Handle</label>
                <input
                  type="text"
                  value={twitterHandle}
                  onChange={(e) => setTwitterHandle(e.target.value)}
                  className="w-full rounded-lg border bg-background px-3 py-2 text-xs font-mono text-foreground focus:border-primary focus:outline-none"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="font-semibold text-foreground">Social Share Image (OpenGraph Image URL)</label>
              <input
                type="url"
                value={ogImageUrl}
                onChange={(e) => setOgImageUrl(e.target.value)}
                className="w-full rounded-lg border bg-background px-3 py-2 text-xs font-mono text-foreground focus:border-primary focus:outline-none"
              />
              <p className="text-[10px] text-muted-foreground">Recommended dimensions: 1200 × 630 px (1.91:1 ratio)</p>
            </div>

            <div className="pt-2 border-t space-y-2">
              <label className="flex items-center gap-2 font-medium text-foreground cursor-pointer">
                <input
                  type="checkbox"
                  checked={robotsIndex}
                  onChange={(e) => setRobotsIndex(e.target.checked)}
                  className="rounded border-line text-primary focus:ring-primary"
                />
                <span>Allow search engines to index this store (index, follow)</span>
              </label>
            </div>
          </form>

          {/* JSON-LD Schema Box */}
          <div className="rounded-2xl border bg-card p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Code className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-bold text-foreground">Structured Data (JSON-LD)</h3>
              </div>
              <button
                type="button"
                onClick={handleCopySchema}
                className="inline-flex items-center gap-1.5 rounded-lg border bg-background px-2.5 py-1 text-xs font-medium hover:bg-muted transition"
              >
                {copiedSchema ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                <span>{copiedSchema ? 'Copied!' : 'Copy JSON-LD'}</span>
              </button>
            </div>

            <pre className="max-h-48 overflow-x-auto rounded-lg bg-muted/40 p-3 text-[10px] font-mono text-muted-foreground leading-tight">
              {schemaString}
            </pre>
          </div>
        </div>

        {/* Right Column: Live Previews */}
        <div className="lg:col-span-6 space-y-6">
          {/* 1. Google Search Snippet Preview */}
          <div className="rounded-2xl border bg-card p-6 shadow-sm space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              <Search className="h-3.5 w-3.5" />
              <span>Google Search Result Preview</span>
            </div>

            <div className="rounded-xl border bg-background p-4 space-y-1.5 shadow-sm font-sans">
              <div className="flex items-center gap-2 text-xs text-muted-foreground truncate">
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-muted text-[9px] font-bold">
                  {storeName[0]}
                </span>
                <span className="text-foreground font-medium">{storeName}</span>
                <span>›</span>
                <span className="truncate">https://{domain}</span>
              </div>

              <h4 className="text-base font-medium text-blue-600 hover:underline cursor-pointer truncate leading-tight">
                {metaTitle}
              </h4>

              <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                {metaDescription}
              </p>
            </div>
          </div>

          {/* 2. Facebook / WhatsApp OpenGraph Card Preview */}
          <div className="rounded-2xl border bg-card p-6 shadow-sm space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              <Share2 className="h-3.5 w-3.5" />
              <span>Facebook / WhatsApp / LinkedIn Card</span>
            </div>

            <div className="overflow-hidden rounded-xl border bg-background shadow-sm">
              <div className="h-44 w-full bg-muted overflow-hidden relative">
                <img
                  src={ogImageUrl}
                  alt="Social share banner"
                  className="h-full w-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = 'none';
                  }}
                />
              </div>

              <div className="p-4 space-y-1 bg-muted/10 border-t">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  {domain}
                </p>
                <h4 className="font-bold text-sm text-foreground truncate">
                  {metaTitle}
                </h4>
                <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                  {metaDescription}
                </p>
              </div>
            </div>
          </div>

          {/* 3. Twitter / X Summary Card Preview */}
          <div className="rounded-2xl border bg-card p-6 shadow-sm space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              <Twitter className="h-3.5 w-3.5" />
              <span>Twitter / X Large Summary Card</span>
            </div>

            <div className="overflow-hidden rounded-2xl border bg-background shadow-sm">
              <div className="h-40 w-full bg-muted overflow-hidden relative">
                <img
                  src={ogImageUrl}
                  alt="Twitter preview"
                  className="h-full w-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = 'none';
                  }}
                />
              </div>

              <div className="p-3.5 space-y-0.5">
                <h4 className="font-bold text-xs text-foreground truncate">
                  {metaTitle}
                </h4>
                <p className="text-[11px] text-muted-foreground line-clamp-1">
                  {metaDescription}
                </p>
                <p className="text-[10px] text-muted-foreground pt-0.5">{domain}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
