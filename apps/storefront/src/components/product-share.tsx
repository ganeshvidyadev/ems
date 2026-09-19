'use client';

import React, { useState } from 'react';
import { Share2, Check, Copy, MessageCircle, Twitter } from 'lucide-react';

export function ProductShare({ productName, productUrl }: { productName: string; productUrl?: string }) {
  const [copied, setCopied] = useState(false);

  function getShareUrl(): string {
    if (productUrl) return productUrl;
    if (typeof window !== 'undefined') return window.location.href;
    return '';
  }

  async function handleCopy() {
    try {
      const url = getShareUrl();
      if (typeof navigator !== 'undefined' && navigator.clipboard && url) {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      }
    } catch (err) {
      console.error('Failed to copy product link:', err);
    }
  }

  const currentUrl = getShareUrl();
  const shareText = encodeURIComponent(`Check out ${productName} on our store!`);
  const shareUrl = encodeURIComponent(currentUrl);

  const whatsappUrl = `https://api.whatsapp.com/send?text=${shareText}%20${shareUrl}`;
  const twitterUrl = `https://twitter.com/intent/tweet?text=${shareText}&url=${shareUrl}`;

  return (
    <div className="border-t border-line pt-4 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="font-semibold text-ink flex items-center gap-1.5">
          <Share2 className="h-3.5 w-3.5 text-brand" />
          Share Product:
        </span>
        <div className="flex items-center gap-2">
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-7 items-center gap-1 rounded-theme border border-line px-2 text-ink hover:border-emerald-500 hover:text-emerald-600 transition-colors"
            title="Share on WhatsApp"
          >
            <MessageCircle className="h-3.5 w-3.5 text-emerald-500" />
            <span className="hidden sm:inline">WhatsApp</span>
          </a>
          <a
            href={twitterUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-7 items-center gap-1 rounded-theme border border-line px-2 text-ink hover:border-sky-500 hover:text-sky-600 transition-colors"
            title="Share on Twitter / X"
          >
            <Twitter className="h-3.5 w-3.5 text-sky-500" />
            <span className="hidden sm:inline">X</span>
          </a>
          <button
            onClick={() => void handleCopy()}
            className={`inline-flex h-7 items-center gap-1 rounded-theme border px-2 transition-colors ${
              copied
                ? 'border-success bg-success/10 text-success'
                : 'border-line text-ink hover:border-brand hover:text-brand'
            }`}
            title="Copy product link"
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            <span>{copied ? 'Copied!' : 'Copy Link'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
