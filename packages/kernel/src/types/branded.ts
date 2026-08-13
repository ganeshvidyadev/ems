declare const brand: unique symbol;

/**
 * Nominal typing over a primitive.
 *
 * `TenantId` and `StoreId` are both `number` at runtime, so passing one where
 * the other is expected compiles cleanly and produces a cross-tenant query. The
 * brand makes that a type error at zero runtime cost.
 */
export type Brand<T, B extends string> = T & { readonly [brand]: B };

export type TenantId = Brand<number, 'TenantId'>;
export type StoreId = Brand<number, 'StoreId'>;
export type UserId = Brand<number, 'UserId'>;
export type CustomerId = Brand<number, 'CustomerId'>;
export type ProductId = Brand<number, 'ProductId'>;
export type VariantId = Brand<number, 'VariantId'>;
export type OrderId = Brand<number, 'OrderId'>;
export type WarehouseId = Brand<number, 'WarehouseId'>;

export const asTenantId = (value: number): TenantId => value as TenantId;
export const asStoreId = (value: number): StoreId => value as StoreId;
export const asUserId = (value: number): UserId => value as UserId;
export const asCustomerId = (value: number): CustomerId => value as CustomerId;
export const asProductId = (value: number): ProductId => value as ProductId;
export const asVariantId = (value: number): VariantId => value as VariantId;
export const asOrderId = (value: number): OrderId => value as OrderId;
export const asWarehouseId = (value: number): WarehouseId => value as WarehouseId;

/** Recursively marks a structure readonly — for frozen config and event payloads. */
export type DeepReadonly<T> = T extends (infer R)[]
  ? readonly DeepReadonly<R>[]
  : T extends Function
    ? T
    : T extends object
      ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
      : T;

export type Nullable<T> = T | null;
export type Maybe<T> = T | null | undefined;
