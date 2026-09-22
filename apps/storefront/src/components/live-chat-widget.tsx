'use client';

import { useState } from 'react';
import { MessageCircle, X, Send, PhoneCall, Mail, Package, RotateCcw, HelpCircle, ChevronRight } from 'lucide-react';
import Link from 'next/link';

interface QuickOption {
  id: string;
  label: string;
  href?: string;
  action?: 'track' | 'return' | 'agent';
}

const QUICK_OPTIONS: QuickOption[] = [
  { id: '1', label: '📦 Track my existing order', href: '/track-order' },
  { id: '2', label: '🔄 Request replacement or return', href: '/account/returns' },
  { id: '3', label: '💬 Talk to WhatsApp representative' },
  { id: '4', label: '✉️ Send support ticket inquiry', href: '/contact' },
];

export function LiveChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Array<{ sender: 'bot' | 'user'; text: string; time: string }>>([
    {
      sender: 'bot',
      text: 'Namaste! Welcome to Customer Support. How can we help you today?',
      time: 'Just now',
    },
  ]);
  const [inputText, setInputText] = useState('');

  function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!inputText.trim()) return;

    const userMsg = inputText.trim();
    setMessages((prev) => [...prev, { sender: 'user', text: userMsg, time: 'Just now' }]);
    setInputText('');

    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        {
          sender: 'bot',
          text: 'Thank you for your message! Our customer delight executive is reviewing your query and will reply shortly. For immediate assistance, feel free to call our toll-free line at 1800-123-9999.',
          time: 'Just now',
        },
      ]);
    }, 1000);
  }

  function handleWhatsAppRedirect() {
    const phone = '919876543210';
    const text = encodeURIComponent('Hi Support Team, I need assistance with my order.');
    window.open(`https://wa.me/${phone}?text=${text}`, '_blank');
  }

  return (
    <div className="fixed bottom-20 right-4 z-40 sm:bottom-6 sm:right-6">
      {!isOpen && (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="flex h-12 w-12 items-center justify-center rounded-full bg-brand text-brand-foreground shadow-xl transition-all duration-200 hover:scale-110 focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2"
          aria-label="Open support chat"
        >
          <MessageCircle className="h-6 w-6" />
        </button>
      )}

      {isOpen && (
        <div className="flex h-[480px] w-[340px] flex-col rounded-2xl border border-line bg-surface shadow-2xl animate-in zoom-in-95 duration-200 sm:w-[380px]">
          {/* Header */}
          <div className="flex items-center justify-between rounded-t-2xl bg-brand px-4 py-3.5 text-brand-foreground">
            <div className="flex items-center gap-2.5">
              <div className="relative flex h-8 w-8 items-center justify-center rounded-full bg-white/20 font-bold text-xs">
                CS
                <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-success ring-2 ring-brand" />
              </div>
              <div>
                <p className="font-heading text-sm font-semibold leading-tight">Customer Support</p>
                <p className="text-[10px] opacity-80">Typically replies in under 5 minutes</p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="rounded-full p-1 text-brand-foreground/80 hover:bg-white/10 hover:text-brand-foreground transition"
              aria-label="Close chat"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Chat Body */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-surface-alt/20 text-xs">
            {messages.map((m, i) => (
              <div
                key={i}
                className={`flex flex-col ${m.sender === 'user' ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 ${
                    m.sender === 'user'
                      ? 'bg-brand text-brand-foreground rounded-br-none'
                      : 'bg-surface border border-line text-ink rounded-bl-none shadow-sm'
                  }`}
                >
                  <p>{m.text}</p>
                </div>
                <span className="text-[9px] text-ink-muted mt-1 px-1">{m.time}</span>
              </div>
            ))}

            {/* Quick Actions Shelf */}
            <div className="pt-2 space-y-1.5">
              <p className="text-[11px] font-semibold text-ink-muted uppercase tracking-wider">Quick Actions</p>
              <div className="grid gap-1.5">
                {QUICK_OPTIONS.map((opt) => {
                  if (opt.href) {
                    return (
                      <Link
                        key={opt.id}
                        href={opt.href}
                        onClick={() => setIsOpen(false)}
                        className="flex items-center justify-between rounded-lg border border-line bg-surface p-2 text-ink hover:border-brand hover:text-brand transition text-[11px]"
                      >
                        <span>{opt.label}</span>
                        <ChevronRight className="h-3 w-3" />
                      </Link>
                    );
                  }
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={handleWhatsAppRedirect}
                      className="flex items-center justify-between rounded-lg border border-line bg-surface p-2 text-ink hover:border-brand hover:text-brand transition text-[11px] text-left"
                    >
                      <span>{opt.label}</span>
                      <ChevronRight className="h-3 w-3" />
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Quick Contact Footer Bar */}
          <div className="flex items-center justify-around border-t border-line/60 bg-surface px-2 py-2 text-[10px] text-ink-muted">
            <a href="tel:18001239999" className="flex items-center gap-1 hover:text-brand">
              <PhoneCall className="h-3 w-3 text-brand" />
              <span>1800-123-9999</span>
            </a>
            <span className="h-3 w-px bg-line" />
            <Link href="/contact" onClick={() => setIsOpen(false)} className="flex items-center gap-1 hover:text-brand">
              <Mail className="h-3 w-3 text-brand" />
              <span>Help Desk</span>
            </Link>
          </div>

          {/* Input Footer */}
          <form onSubmit={handleSend} className="flex items-center gap-2 border-t border-line p-2.5 bg-surface">
            <input
              type="text"
              placeholder="Ask a question..."
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              className="flex-1 rounded-full border border-line bg-surface-alt/40 px-3.5 py-1.5 text-xs text-ink placeholder:text-ink-muted focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
            />
            <button
              type="submit"
              disabled={!inputText.trim()}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand text-brand-foreground disabled:opacity-40 transition"
              aria-label="Send message"
            >
              <Send className="h-3.5 w-3.5" />
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
