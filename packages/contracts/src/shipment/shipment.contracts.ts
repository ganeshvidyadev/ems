import { z } from 'zod';
import { moneySchema, publicIdSchema } from '../common/primitives.js';

export const SHIPMENT_STATUSES = [
  'PENDING',
  'LABEL_CREATED',
  'PICKUP_SCHEDULED',
  'PICKED_UP',
  'IN_TRANSIT',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'FAILED_DELIVERY',
  'RTO_INITIATED',
  'RTO_DELIVERED',
  'CANCELLED',
  'LOST',
  'DAMAGED',
] as const;

export const shipmentEventResponseSchema = z.object({
  status: z.enum(SHIPMENT_STATUSES),
  description: z.string(),
  location: z.string().nullable(),
  eventAt: z.string(),
});
export type ShipmentEventResponse = z.infer<typeof shipmentEventResponseSchema>;

export const shipmentResponseSchema = z.object({
  id: publicIdSchema,
  orderId: publicIdSchema,
  shipmentNumber: z.string(),
  carrier: z.string(),
  awbNumber: z.string().nullable(),
  trackingUrl: z.string().nullable(),
  status: z.enum(SHIPMENT_STATUSES),
  isCod: z.boolean(),
  codAmount: moneySchema,
  events: z.array(shipmentEventResponseSchema).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ShipmentResponse = z.infer<typeof shipmentResponseSchema>;

export const initiateRtoRequestSchema = z.object({
  reason: z.string().trim().min(1).max(500),
});
export type InitiateRtoRequest = z.infer<typeof initiateRtoRequestSchema>;

export const checkServiceabilityRequestSchema = z.object({
  originPincode: z.string().trim().min(4).max(10),
  destinationPincode: z.string().trim().min(4).max(10),
  weightGrams: z.number().int().positive().default(500),
  isCod: z.boolean().default(false),
});
export type CheckServiceabilityRequest = z.infer<typeof checkServiceabilityRequestSchema>;

export const serviceabilityResponseSchema = z.object({
  serviceable: z.boolean(),
  estimatedDays: z.number().optional(),
  reason: z.string().optional(),
});
export type ServiceabilityResponse = z.infer<typeof serviceabilityResponseSchema>;
