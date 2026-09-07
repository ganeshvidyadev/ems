'use client';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Slot } from '@radix-ui/react-slot';
import { type VariantProps, cva } from 'class-variance-authority';
import { ArrowDownRight, ArrowUpRight, Minus, X, type LucideIcon } from 'lucide-react';
import {
  forwardRef,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
  type ThHTMLAttributes,
  type TdHTMLAttributes,
} from 'react';
import { cn } from '@/lib/utils';

/**
 * Minimal ShadCN-style primitives.
 *
 * Hand-written rather than pulled in via the ShadCN CLI so the dependency surface stays
 * small and every component here is one we have actually read. Grown in place for the
 * dashboard rather than swapped for a generated library: every existing call site keeps
 * working, and the additions (Skeleton, StatCard, EmptyState, Sparkline) follow the same
 * two rules as everything above them — `cva` where a component has visual variants,
 * a plain function where it does not, and colour only ever through the tokens.
 */

// ---------------------------------------------------------------------------
// Button
// ---------------------------------------------------------------------------

const buttonVariants = cva(
  // `transition-[…]` rather than `transition-colors`: the press affordance below animates
  // transform and shadow too, and `transition-all` would also animate layout properties,
  // which is what makes a button visibly lurch when its label changes width.
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ' +
    'transition-[color,background-color,border-color,box-shadow,transform] duration-fast ' +
    'ease-out-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ' +
    'focus-visible:ring-offset-2 focus-visible:ring-offset-background ' +
    'disabled:pointer-events-none disabled:opacity-50 ' +
    // A 1% squash on press. The only feedback before this was the hover colour, which a
    // touch device never shows at all, so a tap had no acknowledgement until the request
    // came back.
    'active:scale-[0.99]',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground shadow-xs hover:bg-primary/90',
        // The --secondary token pair existed from the start but no variant used it; a
        // neutral filled button is what a secondary page action wants, where `outline`
        // reads as equal weight to a bordered input next to it.
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        destructive: 'bg-destructive text-destructive-foreground shadow-xs hover:bg-destructive/90',
        outline: 'border border-input bg-background shadow-xs hover:bg-accent hover:text-accent-foreground',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-9 px-3',
        lg: 'h-11 px-8',
        // Square, for an icon with no label. Anything using it must supply its own
        // accessible name (`aria-label` or an `sr-only` span) — there is no text to read.
        icon: 'size-10 p-0',
        'icon-sm': 'size-9 p-0',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  loading?: boolean;
  /**
   * Render the child element with the button's styling instead of a `<button>`.
   *
   * For a button that navigates. Wrapping a `<Link>` in a `<button>` would nest an
   * anchor inside a button — invalid HTML, and it loses middle-click, right-click and
   * "open in new tab", which every user expects from something that changes the URL.
   * A navigating control must be an anchor that merely looks like a button.
   */
  asChild?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, loading, disabled, asChild, children, ...props }, ref) => {
    const classes = cn(buttonVariants({ variant, size }), className);

    if (asChild) {
      // `loading`/`disabled` are meaningless on an anchor and there is no `disabled`
      // attribute to set on one, so they are simply not forwarded here.
      return (
        <Slot ref={ref} className={classes} {...props}>
          {children}
        </Slot>
      );
    }

    return (
      <button
        ref={ref}
        className={classes}
        // Disabled while loading so a double-click cannot submit twice. For anything that
        // moves money the server also requires an idempotency key — UI state is not a
        // substitute for that.
        disabled={disabled || loading}
        {...props}
      >
        {loading && (
          <span
            className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent"
            aria-hidden
          />
        )}
        {children}
      </button>
    );
  },
);
Button.displayName = 'Button';

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      className={cn(
        'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm',
        'placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2',
        'focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed',
        'disabled:opacity-50',
        // Red ring driven by aria-invalid rather than a prop, so the visual state cannot
        // drift from what assistive technology is told.
        'aria-[invalid=true]:border-destructive aria-[invalid=true]:focus-visible:ring-destructive',
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = 'Input';

// ---------------------------------------------------------------------------
// Field — label + control + error, wired for accessibility
// ---------------------------------------------------------------------------

export function Field({
  label,
  htmlFor,
  error,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  const errorId = `${htmlFor}-error`;
  const hintId = `${htmlFor}-hint`;

  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium leading-none">
        {label}
      </label>
      {children}
      {hint && !error && (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
      {/*
        role="alert" so a screen reader announces the error when it appears. A silently
        rendered error message is invisible to anyone not looking at that part of the page.
      */}
      {error && (
        <p id={errorId} role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Alert
// ---------------------------------------------------------------------------

export function Alert({
  variant = 'error',
  title,
  children,
}: {
  variant?: 'error' | 'success' | 'info' | 'warning';
  title?: string;
  children: React.ReactNode;
}) {
  const styles = {
    error: 'border-destructive/40 bg-destructive/10 text-destructive',
    success: 'border-success/40 bg-success/10 text-success',
    info: 'border-primary/40 bg-primary/10 text-primary',
    warning: 'border-warning/40 bg-warning/10 text-warning-foreground',
  } as const;

  return (
    <div
      // assertive for errors: a failed login must be announced immediately, not queued
      // behind other live-region updates.
      role={variant === 'error' ? 'alert' : 'status'}
      aria-live={variant === 'error' ? 'assertive' : 'polite'}
      className={cn('rounded-md border px-3 py-2.5 text-sm', styles[variant])}
    >
      {title && <p className="font-medium">{title}</p>}
      <div className={cn(title && 'mt-0.5 opacity-90')}>{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------

const cardVariants = cva('bg-card text-card-foreground', {
  variants: {
    variant: {
      /** The original look, unchanged, so every existing call site is byte-identical. */
      default: 'rounded-lg border shadow-sm',
      /**
       * Border traded for elevation. On a dashboard grid, eight bordered cards produce a
       * cage of hairlines that competes with the numbers inside them; a shadow says
       * "separate surface" without drawing a line to say it.
       */
      elevated: 'rounded-lg shadow-card',
      /** No boundary at all — for grouping inside an already-bounded surface. */
      plain: 'rounded-lg',
    },
  },
  defaultVariants: { variant: 'default' },
});

export function Card({
  className,
  variant,
  children,
  ...props
}: { className?: string; children: React.ReactNode } & VariantProps<typeof cardVariants> &
  Pick<HTMLAttributes<HTMLDivElement>, 'id' | 'style'>) {
  return (
    <div className={cn(cardVariants({ variant }), className)} {...props}>
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  description,
  action,
  as: Heading = 'h1',
  className,
}: {
  title: string;
  description?: string;
  /** Right-aligned slot for a "View all" link or a small control. */
  action?: ReactNode;
  /**
   * Heading level.
   *
   * Defaults to `h1` because that is what every existing call site renders and several
   * of them (the auth cards, the create forms) have no other heading on the page — a
   * blanket switch to `h2` would leave those documents with no `h1` at all. A card
   * nested under a page title should pass `as="h2"` so the outline stays a tree rather
   * than a row of sibling h1s.
   */
  as?: 'h1' | 'h2' | 'h3';
  className?: string;
}) {
  return (
    <div className={cn('flex items-start justify-between gap-4 p-6 pb-4', className)}>
      <div className="space-y-1">
        <Heading
          className={cn(
            'font-semibold tracking-tight',
            Heading === 'h1' ? 'text-xl' : 'text-sm',
          )}
        >
          {title}
        </Heading>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function CardBody({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn('p-6 pt-0', className)}>{children}</div>;
}

// ---------------------------------------------------------------------------
// Textarea
// ---------------------------------------------------------------------------

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        'flex min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm',
        'placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2',
        'focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed',
        'disabled:opacity-50',
        'aria-[invalid=true]:border-destructive aria-[invalid=true]:focus-visible:ring-destructive',
        className,
      )}
      {...props}
    />
  ),
);
Textarea.displayName = 'Textarea';

// ---------------------------------------------------------------------------
// Select — a styled native <select>, not a Radix combobox: the option list
// here is always short (status/type/store), where a native element is both
// simpler and better on mobile than reimplementing listbox keyboard nav.
// ---------------------------------------------------------------------------

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        'focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    >
      {children}
    </select>
  ),
);
Select.displayName = 'Select';

// ---------------------------------------------------------------------------
// Badge — status pills (product status, order status, etc.)
// ---------------------------------------------------------------------------

const badgeVariants = cva('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium', {
  variants: {
    variant: {
      default: 'bg-secondary text-secondary-foreground',
      success: 'bg-success/15 text-success',
      warning: 'bg-warning/15 text-warning-foreground',
      destructive: 'bg-destructive/15 text-destructive',
      // Neutral-informational, for a count or a label that carries no judgement —
      // an unread badge is not a success and not a warning.
      info: 'bg-primary/15 text-primary',
      outline: 'border border-border text-foreground',
    },
  },
  defaultVariants: { variant: 'default' },
});

export function Badge({
  className,
  variant,
  children,
}: { className?: string; children: ReactNode } & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)}>{children}</span>;
}

// ---------------------------------------------------------------------------
// Table — plain semantic HTML, styled. No virtualization: console list pages
// are paginated server-side (20-50 rows), so there is nothing to virtualize.
// ---------------------------------------------------------------------------

/**
 * `className` lands on the scroll container, not the `<table>`, because that is the
 * element carrying the border — a table already inside a Card passes `border-0` to
 * drop the second boundary rather than the caller re-implementing the wrapper.
 */
export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('w-full overflow-x-auto rounded-md border', className)}>
      <table className="w-full caption-bottom text-sm">{children}</table>
    </div>
  );
}

export function TableHeader({ children, className }: { children: ReactNode; className?: string }) {
  return <thead className={cn('border-b bg-muted/50', className)}>{children}</thead>;
}

export function TableBody({ children, className }: { children: ReactNode; className?: string }) {
  return <tbody className={cn('[&_tr:last-child]:border-0', className)}>{children}</tbody>;
}

export function TableRow({ children, className }: { children: ReactNode; className?: string }) {
  return <tr className={cn('border-b transition-colors hover:bg-muted/50', className)}>{children}</tr>;
}

export function TableHead({ className, children, ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th className={cn('h-11 px-4 text-left align-middle text-xs font-medium text-muted-foreground', className)} {...props}>
      {children}
    </th>
  );
}

export function TableCell({ className, children, ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td className={cn('p-4 align-middle', className)} {...props}>
      {children}
    </td>
  );
}

/** Centered placeholder row for empty/loading states, spanning every column. */
export function TableEmptyRow({ colSpan, children }: { colSpan: number; children: ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="p-10 text-center text-sm text-muted-foreground">
        {children}
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Dialog — thin Radix wrapper for confirmations and compact forms (a full
// create/edit page still gets its own route; this is for "are you sure?").
// ---------------------------------------------------------------------------

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-card p-6 shadow-lg">
          <DialogPrimitive.Title className="text-lg font-semibold">{title}</DialogPrimitive.Title>
          {description && (
            <DialogPrimitive.Description className="mt-1 text-sm text-muted-foreground">
              {description}
            </DialogPrimitive.Description>
          )}
          <div className="mt-4">{children}</div>
          <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <X className="size-4" />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

// ---------------------------------------------------------------------------
// Pagination — simple prev/next + page count, matching the envelope's
// `PaginationMeta` shape (docs/04 §2) exactly, so a caller passes it straight through.
// ---------------------------------------------------------------------------

export function Pagination({
  page,
  totalPages,
  hasNext,
  hasPrev,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
  onPageChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-between px-1 py-3">
      <p className="text-sm text-muted-foreground">
        Page {page} of {totalPages}
      </p>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" disabled={!hasPrev} onClick={() => onPageChange(page - 1)}>
          Previous
        </Button>
        <Button variant="outline" size="sm" disabled={!hasNext} onClick={() => onPageChange(page + 1)}>
          Next
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Skeleton — shape-of-the-content placeholder for async sections
// ---------------------------------------------------------------------------

/**
 * A placeholder that occupies the same box the real content will.
 *
 * Preferred over a centred spinner for anything laid out in a grid: a spinner
 * gives no indication of how much is coming, and when the data lands the page
 * jumps as boxes appear. A skeleton reserves the space, so the arrival is a
 * cross-fade rather than a reflow.
 *
 * `aria-hidden`, and the loading state is announced once by the container's
 * `aria-busy` — otherwise a screen reader reads out a dozen meaningless
 * placeholder boxes.
 */
export function Skeleton({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'relative block overflow-hidden rounded-md bg-muted',
        // A highlight sweeping across, rather than the whole block pulsing: with eight
        // skeletons on screen, eight opacity pulses read as the page flickering.
        'after:absolute after:inset-0 after:-translate-x-full after:animate-shimmer',
        'after:bg-gradient-to-r after:from-transparent after:via-foreground/[0.06] after:to-transparent',
        className,
      )}
    />
  );
}

/** Several skeleton lines, with the last one short so it reads as a paragraph. */
export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn('space-y-2', className)}>
      {Array.from({ length: lines }, (_, index) => (
        <Skeleton
          key={index}
          className={cn('h-4', index === lines - 1 ? 'w-2/5' : 'w-full')}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// EmptyState — the "nothing here yet" surface
// ---------------------------------------------------------------------------

/**
 * Empty is not the same as broken, and neither is the same as zero.
 *
 * A brand-new store legitimately has no orders; showing it a revenue figure of
 * ₹0.00 next to an empty table tells the merchant nothing about whether the
 * console is working or what to do next. This states the situation and offers the
 * one action that changes it.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  /** A lucide icon component, e.g. `ShoppingBag`. Decorative — hidden from AT. */
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center px-6 py-10 text-center', className)}>
      {Icon && (
        <span
          aria-hidden
          className="mb-4 flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground"
        >
          <Icon className="size-5" />
        </span>
      )}
      <p className="text-sm font-medium">{title}</p>
      {description && (
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sparkline — inline trend shape, no charting library
// ---------------------------------------------------------------------------

/**
 * A one-line trend drawn as a plain SVG path.
 *
 * Hand-rolled rather than pulling in a chart library: the whole requirement is
 * "map n numbers onto a polyline", and a charting dependency would add axes,
 * tooltips and a few hundred kilobytes to draw 30 points at 32px tall. When a real
 * analytics page needs axes and hover, that is the moment to add one.
 *
 * `preserveAspectRatio="none"` lets the fixed viewBox stretch to whatever width the
 * card is, so the path never needs remeasuring on resize.
 *
 * Decorative by design: the number it trends is always printed next to it, so this
 * is `aria-hidden` rather than a chart nobody can read aloud.
 */
export function Sparkline({
  values,
  className,
  tone = 'primary',
}: {
  values: number[];
  className?: string;
  tone?: 'primary' | 'success' | 'muted';
}) {
  // Two points is the minimum that can express a direction.
  if (values.length < 2) return null;

  const width = 100;
  const height = 32;
  const max = Math.max(...values);
  const min = Math.min(...values);
  // A flat series would divide by zero; drawing it down the middle is the honest answer.
  const span = max - min || 1;

  const points = values.map((value, index) => {
    const x = (index / (values.length - 1)) * width;
    const y = height - ((value - min) / span) * (height - 4) - 2;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });

  const stroke = {
    primary: 'stroke-primary',
    success: 'stroke-success',
    muted: 'stroke-muted-foreground',
  }[tone];
  const fill = {
    primary: 'fill-primary/10',
    success: 'fill-success/10',
    muted: 'fill-muted-foreground/10',
  }[tone];

  return (
    <svg
      aria-hidden
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={cn('h-8 w-full', className)}
    >
      <polygon className={fill} points={`0,${height} ${points.join(' ')} ${width},${height}`} />
      <polyline
        className={stroke}
        points={points.join(' ')}
        fill="none"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// StatCard — the metric tile
// ---------------------------------------------------------------------------

export interface StatDelta {
  /**
   * Signed percentage change against the comparison period. `null` when the baseline
   * was zero — the first sale is not a "+100 % increase", and rendering one would be
   * inventing a number.
   */
  percent: number | null;
  /** Names the baseline, e.g. "vs previous 30 days". Without it a delta means nothing. */
  comparedTo: string;
  /** Whether a rise is good news. False for refunds or cancellations. Default true. */
  higherIsBetter?: boolean;
}

/**
 * One number, its label, and optionally how it moved.
 *
 * Deliberately *not* a `Card` with a header: the visual weight belongs to the value,
 * so the label is small and muted above it and the value is the largest text in the
 * tile. The whole tile is a link when it has an `href`, because a merchant who reads
 * "142 orders" wants to see those orders.
 */
export function StatCard({
  label,
  value,
  hint,
  delta,
  icon: Icon,
  chart,
  loading,
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  delta?: StatDelta;
  icon?: LucideIcon;
  /** Slot for a `<Sparkline>`; anything taller will stretch the tile. */
  chart?: ReactNode;
  loading?: boolean;
  className?: string;
}) {
  return (
    <div
      aria-busy={loading || undefined}
      className={cn(
        'rounded-lg bg-card p-5 shadow-card transition-shadow duration-base ease-out-soft',
        'hover:shadow-raised',
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        {Icon && <Icon aria-hidden className="size-4 shrink-0 text-muted-foreground" />}
      </div>

      {loading ? (
        <Skeleton className="mt-3 h-8 w-24" />
      ) : (
        <p className="display mt-2 text-2xl font-semibold">{value}</p>
      )}

      <div className="mt-2 flex min-h-5 items-center gap-2 text-xs">
        {loading ? (
          <Skeleton className="h-3 w-28" />
        ) : (
          <>
            {delta && <DeltaBadge {...delta} />}
            {hint && <span className="text-muted-foreground">{hint}</span>}
          </>
        )}
      </div>

      {chart && !loading && <div className="mt-3">{chart}</div>}
    </div>
  );
}

function DeltaBadge({ percent, comparedTo, higherIsBetter = true }: StatDelta) {
  if (percent === null) {
    return <span className="text-muted-foreground">No prior data</span>;
  }

  // Rounded before the zero test, so ±0.4 % renders as flat rather than as a
  // green arrow for a change that displays as "0.0%".
  const rounded = Math.round(percent * 10) / 10;
  const rising = rounded > 0;
  const flat = rounded === 0;
  const good = higherIsBetter ? rising : !rising;

  const Arrow = flat ? Minus : rising ? ArrowUpRight : ArrowDownRight;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 font-medium',
        flat ? 'text-muted-foreground' : good ? 'text-success' : 'text-destructive',
      )}
    >
      <Arrow aria-hidden className="size-3.5" />
      {/* Sign spelled out for assistive tech: an arrow glyph alone conveys nothing. */}
      <span className="sr-only">{flat ? 'unchanged' : rising ? 'up' : 'down'}</span>
      {Math.abs(rounded).toFixed(1)}%
      <span className="ml-1 font-normal text-muted-foreground">{comparedTo}</span>
    </span>
  );
}
