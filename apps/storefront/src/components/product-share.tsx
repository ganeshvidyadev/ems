'use client';

import React, { useState } from 'react';
import { Share2, Check, Copy, MessageCircle, Twitter, QrCode, X, Send } from 'lucide-react';

export function ProductShare({ productName, productUrl }: { productName: string; productUrl?: string }) {
  const [copied, setCopied] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);

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

  async function handleNativeShare() {
    const url = getShareUrl();
    if (typeof navigator !== 'undefined' && navigator.share && url) {
      try {
        await navigator.share({
          title: productName,
          text: `Check out ${productName} on our store!`,
          url,
        });
      } catch {
        // User cancelled or failed
      }
    } else {
      void handleCopy();
    }
  }

  const currentUrl = getShareUrl();
  const shareText = encodeURIComponent(`Check out ${productName} on our store!`);
  const shareUrl = encodeURIComponent(currentUrl);

  const whatsappUrl = `https://api.whatsapp.com/send?text=${shareText}%20${shareUrl}`;
  const twitterUrl = `https://twitter.com/intent/tweet?text=${shareText}&url=${shareUrl}`;
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${shareUrl}&margin=10`;

  return (
    <div className="border-t border-line pt-4 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="font-semibold text-ink flex items-center gap-1.5">
          <Share2 className="h-3.5 w-3.5 text-brand" />
          Share Product:
        </span>
        <div className="flex items-center gap-2">
          {/* Native Web Share on supported devices */}
          {typeof navigator !== 'undefined' && typeof navigator.share === 'function' && (
            <button
              onClick={() => void handleNativeShare()}
              className="inline-flex h-7 items-center gap-1 rounded-theme border border-line px-2 text-ink hover:border-brand hover:text-brand transition-colors"
              title="Share via device options"
            >
              <Send className="h-3.5 w-3.5 text-brand" />
              <span>Share</span>
            </button>
          )}

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

          {/* QR Code trigger */}
          <button
            onClick={() => setQrOpen(true)}
            className="inline-flex h-7 items-center gap-1 rounded-theme border border-line px-2 text-ink hover:border-brand hover:text-brand transition-colors"
            title="Scan QR code on mobile"
          >
            <QrCode className="h-3.5 w-3.5 text-ink-muted" />
            <span className="hidden sm:inline">QR Code</span>
          </button>

          {/* Copy link button */}
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

      {/* QR Code Modal Dialog */}
      {qrOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in">
          <div
            className="fixed inset-0"
            onClick={() => setQrOpen(false)}
            aria-hidden="true"
          />

          <div className="relative w-full max-w-xs rounded-2xl border border-line bg-surface p-6 shadow-2xl text-center z-10 animate-scale-in">
            <button
              onClick={() => setQrOpen(false)}
              className="absolute top-3 right-3 rounded-lg p-1.5 text-ink-muted hover:bg-surface-alt hover:text-ink transition"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="flex h-10 w-10 mx-auto items-center justify-center rounded-full bg-brand/10 text-brand mb-3">
              <QrCode className="h-5 w-5" />
            </div>

            <h3 className="font-heading text-base font-bold text-ink">Scan on Mobile</h3>
            <p className="mt-1 text-xs text-ink-muted leading-relaxed">
              Open your smartphone camera to view this product on mobile.
            </p>

            <div className="my-4 flex justify-center">
              <div className="p-3 bg-white rounded-xl border border-line shadow-xs inline-block">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={qrCodeUrl}
                  alt={`QR Code for ${productName}`}
                  className="h-44 w-44 object-contain"
                  loading="lazy"
                />
              </div>
            </div>

            <p className="text-[11px] font-medium text-ink truncate px-2 mb-4">
              {productName}
            </p>

            <button
              onClick={() => setQrOpen(false)}
              className="w-full rounded-theme bg-surface-alt py-2 text-xs font-semibold text-ink hover:bg-line transition"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
