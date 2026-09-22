'use client';

import React, { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { Mail, Phone, MapPin, MessageSquare, Send, CheckCircle2, Clock, ShieldCheck, HelpCircle } from 'lucide-react';

export default function ContactSupportPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setTimeout(() => {
      setIsSubmitting(false);
      setSubmitted(true);
    }, 500);
  };

  return (
    <div className="mx-auto max-w-4xl space-y-10">
      <div className="text-center space-y-2">
        <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">Customer Support &amp; Help Center</h1>
        <p className="text-sm text-ink-muted max-w-lg mx-auto">
          Have a question about your order, return, or product specifications? We&apos;re here to help you 24/7.
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_22rem]">
        <div className="rounded-theme border border-line bg-surface p-6 shadow-sm space-y-5">
          <div className="flex items-center gap-2 border-b border-line pb-4">
            <MessageSquare className="h-5 w-5 text-brand" />
            <h2 className="text-base font-bold text-ink">Send Us a Message</h2>
          </div>

          {submitted ? (
            <div className="rounded-theme bg-success/10 border border-success/20 p-8 text-center space-y-3">
              <CheckCircle2 className="mx-auto h-10 w-10 text-success" />
              <h3 className="text-base font-bold text-ink">Thank You! Your message is received.</h3>
              <p className="text-xs text-ink-muted max-w-sm mx-auto">
                Our support team has created ticket for your query and will respond within 2–4 hours on your registered email.
              </p>
              <button
                type="button"
                onClick={() => {
                  setSubmitted(false);
                  setMessage('');
                  setSubject('');
                }}
                className="mt-4 inline-flex items-center rounded-theme bg-brand px-4 py-2 text-xs font-semibold text-brand-foreground hover:bg-brand/90"
              >
                Send Another Inquiry
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="name" className="block text-xs font-semibold uppercase tracking-wider text-ink mb-1.5">
                    Your Full Name
                  </label>
                  <input
                    id="name"
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Alex Morgan"
                    className="h-10 w-full rounded-theme border border-line bg-surface-alt px-3 text-sm text-ink focus:border-brand focus:outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="email" className="block text-xs font-semibold uppercase tracking-wider text-ink mb-1.5">
                    Email Address
                  </label>
                  <input
                    id="email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="alex@example.com"
                    className="h-10 w-full rounded-theme border border-line bg-surface-alt px-3 text-sm text-ink focus:border-brand focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="subject" className="block text-xs font-semibold uppercase tracking-wider text-ink mb-1.5">
                  Subject / Topic
                </label>
                <select
                  id="subject"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  required
                  className="h-10 w-full rounded-theme border border-line bg-surface-alt px-3 text-sm text-ink focus:border-brand focus:outline-none"
                >
                  <option value="">Select an inquiry category</option>
                  <option value="ORDER_STATUS">Order Status &amp; Tracking</option>
                  <option value="RETURN_REFUND">Return / Replacement Request</option>
                  <option value="PAYMENT_ISSUE">Payment / Billing Query</option>
                  <option value="PRODUCT_DETAILS">Product Specifications</option>
                  <option value="OTHER">General Feedback / Other</option>
                </select>
              </div>

              <div>
                <label htmlFor="message" className="block text-xs font-semibold uppercase tracking-wider text-ink mb-1.5">
                  Your Message
                </label>
                <textarea
                  id="message"
                  rows={4}
                  required
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Please describe how we can assist you with details..."
                  className="w-full rounded-theme border border-line bg-surface-alt p-3 text-sm text-ink focus:border-brand focus:outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-theme bg-brand px-4 text-sm font-semibold text-brand-foreground hover:bg-brand/90 transition-colors disabled:opacity-50"
              >
                {isSubmitting ? 'Submitting inquiry...' : 'Submit Inquiry'}
                {!isSubmitting && <Send className="h-4 w-4" />}
              </button>
            </form>
          )}
        </div>

        <div className="space-y-4">
          <div className="rounded-theme border border-line bg-surface p-5 space-y-4 shadow-sm">
            <h3 className="text-xs font-bold uppercase tracking-wider text-ink">Direct Support Channels</h3>
            
            <div className="space-y-3 text-xs">
              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand">
                  <Mail className="h-4 w-4" />
                </div>
                <div>
                  <p className="font-semibold text-ink">Email Support</p>
                  <p className="text-ink-muted">support@yourdomain.com</p>
                  <p className="text-[11px] text-ink-muted">Replies within 2–4 hours</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand">
                  <Phone className="h-4 w-4" />
                </div>
                <div>
                  <p className="font-semibold text-ink">Toll-Free Helpline</p>
                  <p className="text-ink-muted">+91 (800) 123-4567</p>
                  <p className="text-[11px] text-ink-muted">Mon–Sat: 9:00 AM – 7:00 PM IST</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand">
                  <MapPin className="h-4 w-4" />
                </div>
                <div>
                  <p className="font-semibold text-ink">Headquarters</p>
                  <p className="text-ink-muted">Cyber City, Gurugram, Haryana, India</p>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-theme border border-line bg-surface-alt/60 p-4 space-y-2 text-xs">
            <p className="font-bold text-ink">Looking for something else?</p>
            <ul className="space-y-1 text-brand">
              <li>
                <Link href="/track-order" className="hover:underline flex items-center gap-1">
                  → Track an existing order
                </Link>
              </li>
              <li>
                <Link href="/account/returns" className="hover:underline flex items-center gap-1">
                  → Returns &amp; refund status
                </Link>
              </li>
              <li>
                <Link href="/products/compare" className="hover:underline flex items-center gap-1">
                  → Product comparison matrix
                </Link>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}