import { Loader2 } from 'lucide-react';
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

/**
 * A deliberately small set of primitives.
 *
 * Hand-written rather than pulled from a component library: this storefront needs
 * a button, an input and a few containers, and a headless UI kit plus a variance
 * helper would be more configuration than component at that size. Everything here
 * is built from the theme tokens (`bg-brand`, `text-ink`, `border-line`) so a
 * tenant's injected palette reaches it without any component knowing it exists.
 */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-brand text-brand-foreground hover:opacity-90 border border-transparent',
  secondary: 'bg-surface text-ink border border-line hover:bg-surface-alt',
  ghost: 'bg-transparent text-ink-muted border border-transparent hover:bg-surface-alt hover:text-ink',
  danger: 'bg-transparent text-sale border border-transparent hover:bg-surface-alt',
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-sm',
  md: 'h-10 px-4 text-sm',
  lg: 'h-12 px-6 text-base',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner and blocks input. Separate from `disabled` so the reason is legible at the call site. */
  loading?: boolean;
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      // A loading button must not be clickable — a second submit is exactly the
      // double-order this guards against.
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-theme font-medium transition',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
        'disabled:cursor-not-allowed disabled:opacity-50',
        BUTTON_VARIANTS[variant],
        BUTTON_SIZES[size],
        className,
      )}
      {...props}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'h-10 w-full rounded-theme border border-line bg-surface px-3 text-sm text-ink',
        'placeholder:text-ink-muted',
        'focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand',
        'disabled:cursor-not-allowed disabled:bg-surface-alt disabled:opacity-60',
        // `aria-invalid` drives the error styling so the visual state and the state
        // a screen reader announces can never disagree.
        'aria-[invalid=true]:border-sale aria-[invalid=true]:focus:ring-sale',
        className,
      )}
      {...props}
    />
  );
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        'w-full rounded-theme border border-line bg-surface px-3 py-2 text-sm text-ink',
        'placeholder:text-ink-muted',
        'focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand',
        className,
      )}
      {...props}
    />
  );
}

/** A labelled form row with room for an error message that does not shift layout when it appears. */
export function Field({
  label,
  htmlFor,
  error,
  hint,
  required,
  className,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: string;
  required?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <label htmlFor={htmlFor} className="block text-sm font-medium text-ink">
        {label}
        {required && (
          <span className="ml-0.5 text-sale" aria-hidden>
            *
          </span>
        )}
      </label>
      {children}
      {hint && !error && <p className="text-xs text-ink-muted">{hint}</p>}
      {error && (
        <p className="text-xs text-sale" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('rounded-theme border border-line bg-surface', className)}>{children}</div>;
}

export function Spinner({ className, label = 'Loading' }: { className?: string; label?: string }) {
  return (
    <span role="status" aria-label={label}>
      <Loader2 className={cn('h-5 w-5 animate-spin text-ink-muted', className)} aria-hidden />
    </span>
  );
}

export function Badge({
  children,
  tone = 'neutral',
  className,
}: {
  children: ReactNode;
  tone?: 'neutral' | 'sale' | 'brand';
  className?: string;
}) {
  const tones = {
    neutral: 'bg-surface-alt text-ink-muted border-line',
    sale: 'bg-sale text-white border-transparent',
    brand: 'bg-brand text-brand-foreground border-transparent',
  } as const;

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** A short, readable message where a section's content would be — not a full-page error. */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center gap-3 rounded-theme border border-line bg-surface-alt px-6 py-14 text-center', className)}>
      {icon && <div className="text-ink-muted">{icon}</div>}
      <h2 className="text-base font-semibold text-ink">{title}</h2>
      {description && <p className="max-w-md text-sm text-ink-muted">{description}</p>}
      {action && <div className="pt-1">{action}</div>}
    </div>
  );
}

export function Alert({ children, tone = 'error' }: { children: ReactNode; tone?: 'error' | 'info' | 'success' }) {
  // No `/opacity` modifiers on these colours. The tokens are `var(--sale, #dc2626)`
  // rather than bare channels, so Tailwind cannot rewrite them into an
  // `rgb(... / alpha)` and the utility silently produces no colour at all.
  const tones = {
    error: 'border-sale bg-surface text-sale',
    info: 'border-line bg-surface-alt text-ink-muted',
    success: 'border-brand bg-surface-alt text-ink',
  } as const;

  return (
    <div role="alert" className={cn('rounded-theme border px-3 py-2 text-sm', tones[tone])}>
      {children}
    </div>
  );
}
