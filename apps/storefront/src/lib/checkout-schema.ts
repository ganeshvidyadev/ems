import { z } from 'zod';

/**
 * The checkout form's own schema.
 *
 * Mirrors the API's `orderAddressSchema` — which is `addressRequestSchema` picked
 * down to the delivery fields — field for field, so the browser rejects what the
 * server would reject and the shopper is never told "invalid" by a 422 they cannot
 * see the cause of.
 *
 * It is a separate declaration rather than a direct import for one reason: a form
 * needs `''` to mean "the shopper left this blank", while the API needs those
 * fields absent entirely. `toOrderAddress()` below is where that conversion
 * happens, once, instead of at every field.
 *
 * Required per the API: `recipientName`, `addressLine1`, `city`, `postalCode`,
 * `countryCode`. Optional: `phone`, `addressLine2`, `landmark`, `stateCode`,
 * `stateName`.
 */

/** E.164, matching `phoneSchema`. Empty is allowed here and dropped before sending. */
const optionalPhone = z
  .string()
  .trim()
  .refine((value) => value === '' || /^\+[1-9]\d{7,14}$/.test(value), {
    message: 'Use the international format, e.g. +919876543210',
  });

export const checkoutFormSchema = z.object({
  email: z
    .string()
    .trim()
    .refine((value) => value === '' || z.string().email().safeParse(value).success, {
      message: 'Enter a valid email address',
    }),
  phone: optionalPhone,

  recipientName: z
    .string()
    .trim()
    .min(1, 'Who should we deliver to?')
    .max(200, 'Must be at most 200 characters'),
  addressLine1: z
    .string()
    .trim()
    .min(1, 'Enter the street address')
    .max(255, 'Must be at most 255 characters'),
  addressLine2: z.string().trim().max(255, 'Must be at most 255 characters'),
  landmark: z.string().trim().max(255, 'Must be at most 255 characters'),
  city: z.string().trim().min(1, 'Enter the city').max(120, 'Must be at most 120 characters'),
  stateCode: z.string().trim().max(10, 'Must be at most 10 characters'),
  stateName: z.string().trim().max(120, 'Must be at most 120 characters'),
  postalCode: z
    .string()
    .trim()
    .min(1, 'Enter the postal code')
    .max(20, 'Must be at most 20 characters'),
  countryCode: z
    .string()
    .trim()
    .length(2, 'Use the two-letter country code')
    .regex(/^[A-Za-z]{2}$/, 'Use the two-letter country code'),

  customerNote: z.string().trim().max(2000, 'Must be at most 2000 characters'),

  // Only the gateways verified to place a real order in this environment. A
  // selector offering one that 500s is worse than no selector.
  paymentGateway: z.enum(['cod']),
});

export type CheckoutFormValues = z.infer<typeof checkoutFormSchema>;

export const CHECKOUT_FORM_DEFAULTS: CheckoutFormValues = {
  email: '',
  phone: '',
  recipientName: '',
  addressLine1: '',
  addressLine2: '',
  landmark: '',
  city: '',
  stateCode: '',
  stateName: '',
  postalCode: '',
  countryCode: 'IN',
  customerNote: '',
  paymentGateway: 'cod',
};

export interface OrderAddressPayload {
  recipientName: string;
  phone?: string;
  addressLine1: string;
  addressLine2?: string;
  landmark?: string;
  city: string;
  stateCode?: string;
  stateName?: string;
  postalCode: string;
  countryCode: string;
}

/** Drops blank optionals: the API distinguishes "absent" from "present but empty". */
export function toOrderAddress(values: CheckoutFormValues): OrderAddressPayload {
  const optional = (value: string): string | undefined => (value.trim() ? value.trim() : undefined);

  return {
    recipientName: values.recipientName.trim(),
    phone: optional(values.phone),
    addressLine1: values.addressLine1.trim(),
    addressLine2: optional(values.addressLine2),
    landmark: optional(values.landmark),
    city: values.city.trim(),
    stateCode: optional(values.stateCode),
    stateName: optional(values.stateName),
    postalCode: values.postalCode.trim(),
    countryCode: values.countryCode.trim().toUpperCase(),
  };
}

/**
 * Whether the address is complete enough to be worth pricing.
 *
 * The pricing endpoint needs a *valid* address or it 422s, so the live summary
 * only asks for a quote once the required fields are actually filled — otherwise
 * every keystroke in an empty form would fire a request that fails.
 */
export function isAddressPriceable(values: CheckoutFormValues): boolean {
  return Boolean(
    values.recipientName.trim() &&
      values.addressLine1.trim() &&
      values.city.trim() &&
      values.postalCode.trim() &&
      /^[A-Za-z]{2}$/.test(values.countryCode.trim()),
  );
}
