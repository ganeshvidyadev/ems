import { z } from 'zod';

/** Reusable field-level schemas. Defined once so validation cannot drift between endpoints. */

export const publicIdSchema = z
  .string()
  .length(26)
  .regex(/^[0-9A-HJKMNP-TV-Z]{26}$/, 'Must be a valid ULID');

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3)
  .max(255)
  .email('Must be a valid email address');

/**
 * E.164 phone number. Storing a normalized form is what makes "is this the same
 * customer?" answerable; accepting free-form input makes it guesswork.
 */
export const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+[1-9]\d{7,14}$/, 'Must be E.164 format, e.g. +919876543210');

/**
 * Password policy: length over composition rules. NIST SP 800-63B guidance —
 * mandatory symbol/digit classes push users toward `Password1!` patterns that
 * are shorter and more predictable than a long passphrase.
 */
export const passwordSchema = z
  .string()
  .min(12, 'Must be at least 12 characters')
  .max(128, 'Must be at most 128 characters')
  .refine((v) => !/^\s|\s$/.test(v), 'Must not start or end with whitespace');

export const slugSchema = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Lowercase letters, digits and single hyphens only');

/** RFC 1123 DNS label — a tenant subdomain. */
export const dnsLabelSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, 'Must be at least 3 characters')
  .max(63, 'Must be at most 63 characters')
  .regex(
    /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/,
    'Must start and end with a letter or digit; hyphens allowed in between',
  );

export const hostnameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(253)
  .regex(
    /^(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/,
    'Must be a valid fully-qualified hostname',
  );

export const currencyCodeSchema = z
  .string()
  .length(3)
  .toUpperCase()
  .regex(/^[A-Z]{3}$/, 'Must be an ISO-4217 alpha code');

export const countryCodeSchema = z
  .string()
  .length(2)
  .toUpperCase()
  .regex(/^[A-Z]{2}$/, 'Must be an ISO-3166-1 alpha-2 code');

/**
 * Money on the wire.
 *
 * `amountMinor` is a **string** because JSON has no bigint and a number would
 * reintroduce the float imprecision the Money value object exists to prevent.
 */
export const moneySchema = z.object({
  amountMinor: z.string().regex(/^-?\d+$/, 'Must be an integer string of minor units'),
  currency: currencyCodeSchema,
});
export type MoneyDto = z.infer<typeof moneySchema>;

/** Accepts an integer or its string form (query params arrive as strings). */
export const minorUnitsSchema = z.union([
  z.number().int(),
  z.string().regex(/^-?\d+$/).transform(Number),
]);

export const isoDateTimeSchema = z.string().datetime({ offset: true });

export const timezoneSchema = z.string().max(64).refine(
  (tz) => {
    try {
      new Intl.DateTimeFormat('en', { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  },
  { message: 'Must be a valid IANA timezone' },
);

export const localeSchema = z
  .string()
  .max(10)
  .regex(/^[a-z]{2}(-[A-Z]{2})?$/, 'Must be a BCP-47 tag such as en-IN');

/** Trimmed, non-empty, length-capped text. */
export const shortTextSchema = (max = 255) => z.string().trim().min(1).max(max);
export const optionalTextSchema = (max = 255) =>
  z.string().trim().max(max).optional().or(z.literal('').transform(() => undefined));
