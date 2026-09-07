import { Injectable } from '@nestjs/common';
import type {
  AddressRequest,
  AddressResponse,
  CreateCustomerRequest,
  CustomerResponse,
  UpdateAddressRequest,
  UpdateCustomerRequest,
  WishlistItemResponse,
} from '@ems/contracts';
import { ConflictError } from '@ems/kernel';
import { UserEntity } from '../../database/entities';
import type { CustomerAddressEntity, CustomerEntity } from '../../database/entities';
import { HashService } from '../../common/services/hash.service';
import type { PaginatedResult } from '../../database/repositories/tenant-scoped.repository';
import { CustomerAddressRepository, CustomerRepository, WishlistItemRepository } from './customer.repository';

@Injectable()
export class CustomerService {
  constructor(
    private readonly customers: CustomerRepository,
    private readonly addresses: CustomerAddressRepository,
    private readonly wishlist: WishlistItemRepository,
    private readonly hash: HashService,
  ) {}

  async list(query: {
    page: number;
    limit: number;
    storeId?: string;
    status?: CustomerEntity['status'];
    sort: { field: string; direction: 'ASC' | 'DESC' }[];
  }): Promise<PaginatedResult<CustomerEntity>> {
    let storeId: string | undefined;
    if (query.storeId) {
      storeId = (await this.customers.resolveStoreId(query.storeId)) ?? undefined;
    }

    return this.customers.findAndCount({
      where: {
        ...(storeId ? { storeId } : {}),
        ...(query.status ? { status: query.status } : {}),
      },
      order: Object.fromEntries(query.sort.map((s) => [s.field, s.direction])),
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    });
  }

  async getByPublicId(publicId: string): Promise<CustomerEntity> {
    return this.customers.findByPublicIdOrFail(publicId);
  }

  async create(input: CreateCustomerRequest): Promise<CustomerEntity> {
    const storeId = input.storeId
      ? await this.mustResolveStore(input.storeId)
      : await this.defaultStoreId();

    const emailNormalized = input.email ? UserEntity.normalizeEmail(input.email) : null;

    if (emailNormalized && (await this.customers.emailExists(storeId, emailNormalized))) {
      throw new ConflictError('A customer with this email already exists for this store');
    }

    const passwordHash = input.password ? await this.hash.hash(input.password) : null;

    return this.customers.insert({
      storeId,
      email: input.email ?? null,
      emailNormalized,
      phoneE164: input.phone ?? null,
      passwordHash,
      firstName: input.firstName ?? null,
      lastName: input.lastName ?? null,
      status: 'ACTIVE',
      isGuest: false,
      acceptsMarketing: input.acceptsMarketing,
      marketingConsentAt: input.acceptsMarketing ? new Date() : null,
    });
  }

  async update(publicId: string, input: UpdateCustomerRequest): Promise<CustomerEntity> {
    const customer = await this.customers.findByPublicIdOrFail(publicId);

    Object.assign(customer, {
      firstName: input.firstName ?? customer.firstName,
      lastName: input.lastName ?? customer.lastName,
      dateOfBirth: input.dateOfBirth ?? customer.dateOfBirth,
      gender: input.gender ?? customer.gender,
      acceptsMarketing: input.acceptsMarketing ?? customer.acceptsMarketing,
      customerGroup: input.customerGroup === undefined ? customer.customerGroup : input.customerGroup,
      taxExempt: input.taxExempt ?? customer.taxExempt,
      taxRegistration:
        input.taxRegistration === undefined ? customer.taxRegistration : input.taxRegistration,
      notes: input.notes === undefined ? customer.notes : input.notes,
      tags: input.tags ?? customer.tags,
      status: input.status ?? customer.status,
    });

    await this.customers.save(customer);
    return customer;
  }

  // -------------------------------------------------------------------------
  // Addresses
  // -------------------------------------------------------------------------

  async listAddresses(customerPublicId: string): Promise<CustomerAddressEntity[]> {
    const customer = await this.customers.findByPublicIdOrFail(customerPublicId);
    return this.addresses.findByCustomer(customer.id);
  }

  async addAddress(customerPublicId: string, input: AddressRequest): Promise<CustomerAddressEntity> {
    const customer = await this.customers.findByPublicIdOrFail(customerPublicId);

    if (input.isDefaultShipping) await this.addresses.clearDefault(customer.id, 'isDefaultShipping');
    if (input.isDefaultBilling) await this.addresses.clearDefault(customer.id, 'isDefaultBilling');

    return this.addresses.insert({
      customerId: customer.id,
      label: input.label ?? null,
      type: input.type,
      recipientName: input.recipientName,
      phoneE164: input.phone ?? null,
      addressLine1: input.addressLine1,
      addressLine2: input.addressLine2 ?? null,
      landmark: input.landmark ?? null,
      city: input.city,
      stateCode: input.stateCode ?? null,
      stateName: input.stateName ?? null,
      postalCode: input.postalCode,
      countryCode: input.countryCode,
      isDefaultShipping: input.isDefaultShipping,
      isDefaultBilling: input.isDefaultBilling,
    });
  }

  async updateAddress(
    customerPublicId: string,
    addressPublicId: string,
    input: UpdateAddressRequest,
  ): Promise<CustomerAddressEntity> {
    const customer = await this.customers.findByPublicIdOrFail(customerPublicId);
    const address = await this.addresses.findByPublicIdOrFail(addressPublicId);
    if (address.customerId !== customer.id) {
      throw new ConflictError('Address does not belong to this customer');
    }

    if (input.isDefaultShipping) await this.addresses.clearDefault(customer.id, 'isDefaultShipping');
    if (input.isDefaultBilling) await this.addresses.clearDefault(customer.id, 'isDefaultBilling');

    Object.assign(address, {
      label: input.label ?? address.label,
      type: input.type ?? address.type,
      recipientName: input.recipientName ?? address.recipientName,
      phoneE164: input.phone ?? address.phoneE164,
      addressLine1: input.addressLine1 ?? address.addressLine1,
      addressLine2: input.addressLine2 ?? address.addressLine2,
      landmark: input.landmark ?? address.landmark,
      city: input.city ?? address.city,
      stateCode: input.stateCode ?? address.stateCode,
      stateName: input.stateName ?? address.stateName,
      postalCode: input.postalCode ?? address.postalCode,
      countryCode: input.countryCode ?? address.countryCode,
      isDefaultShipping: input.isDefaultShipping ?? address.isDefaultShipping,
      isDefaultBilling: input.isDefaultBilling ?? address.isDefaultBilling,
    });

    await this.addresses.save(address);
    return address;
  }

  async removeAddress(customerPublicId: string, addressPublicId: string): Promise<void> {
    const customer = await this.customers.findByPublicIdOrFail(customerPublicId);
    const address = await this.addresses.findByPublicIdOrFail(addressPublicId);
    if (address.customerId !== customer.id) {
      throw new ConflictError('Address does not belong to this customer');
    }
    await this.addresses.softDeleteByPublicId(addressPublicId);
  }

  // -------------------------------------------------------------------------
  // Wishlist
  // -------------------------------------------------------------------------

  /**
   * `WishlistItemEntity.productId`/`variantId` are internal FK ids, but
   * `WishlistItemResponse` (like every other console response) promises
   * public ULIDs — resolved here, back to public ids, before the controller's
   * `wishlistItemToResponse` forwards them through unchanged. Found live: the
   * console rendered a raw internal id ("1") where a product name/SKU lookup
   * should have resolved, the same id-space mismatch inventory's endpoints
   * had before that fix.
   */
  async listWishlist(customerPublicId: string): Promise<{ productId: string; variantId: string | null; addedAt: Date }[]> {
    const customer = await this.customers.findByPublicIdOrFail(customerPublicId);
    const items = await this.wishlist.findByCustomer(customer.id);

    const productPublicIds = await this.customers.publicIdsFor('products', items.map((i) => i.productId));
    const variantInternalIds = items
      .map((i) => i.variantId)
      .filter((id): id is string => id !== null);
    const variantPublicIds = await this.customers.publicIdsFor('product_variants', variantInternalIds);

    return items.map((item) => ({
      productId: productPublicIds.get(item.productId) ?? item.productId,
      variantId: item.variantId ? (variantPublicIds.get(item.variantId) ?? item.variantId) : null,
      addedAt: item.addedAt,
    }));
  }

  async addWishlistItem(
    customerPublicId: string,
    productInternalId: string,
    variantInternalId: string | null,
  ): Promise<void> {
    const customer = await this.customers.findByPublicIdOrFail(customerPublicId);
    const existing = await this.wishlist.find({
      where: { customerId: customer.id, productId: productInternalId },
    });
    if (existing.some((item) => item.variantId === variantInternalId)) return;

    await this.wishlist.insert({
      customerId: customer.id,
      productId: productInternalId,
      variantId: variantInternalId,
    });
  }

  /** Resolves public product/variant ids to internal ones, then delegates. */
  async addWishlistItemByPublicIds(
    customerPublicId: string,
    productPublicId: string,
    variantPublicId: string | null,
  ): Promise<void> {
    const { productId, variantId } = await this.resolveProductIds(productPublicId, variantPublicId);
    await this.addWishlistItem(customerPublicId, productId, variantId);
  }

  async removeWishlistItemByPublicIds(
    customerPublicId: string,
    productPublicId: string,
    variantPublicId: string | null,
  ): Promise<void> {
    const { productId, variantId } = await this.resolveProductIds(productPublicId, variantPublicId);
    await this.removeWishlistItem(customerPublicId, productId, variantId);
  }

  private async resolveProductIds(
    productPublicId: string,
    variantPublicId: string | null,
  ): Promise<{ productId: string; variantId: string | null }> {
    const productId = await this.customers.resolvePublicId('products', productPublicId);
    if (!productId) throw new ConflictError(`Product '${productPublicId}' not found`);

    let variantId: string | null = null;
    if (variantPublicId) {
      variantId = await this.customers.resolvePublicId('product_variants', variantPublicId);
      if (!variantId) throw new ConflictError(`Variant '${variantPublicId}' not found`);
    }

    return { productId, variantId };
  }

  async removeWishlistItem(
    customerPublicId: string,
    productInternalId: string,
    variantInternalId: string | null,
  ): Promise<void> {
    const customer = await this.customers.findByPublicIdOrFail(customerPublicId);
    const items = await this.wishlist.find({
      where: { customerId: customer.id, productId: productInternalId },
    });
    const match = items.find((item) => item.variantId === variantInternalId);
    if (match) await this.wishlist.hardDelete({ id: match.id } as never);
  }

  // -------------------------------------------------------------------------
  // Mapping
  // -------------------------------------------------------------------------

  toResponse(customer: CustomerEntity, storePublicId: string): CustomerResponse {
    return {
      id: customer.publicId,
      storeId: storePublicId,
      email: customer.email,
      phone: customer.phoneE164,
      firstName: customer.firstName,
      lastName: customer.lastName,
      displayName: customer.displayName,
      status: customer.status,
      isGuest: customer.isGuest,
      emailVerified: customer.emailVerifiedAt !== null,
      phoneVerified: customer.phoneVerifiedAt !== null,
      acceptsMarketing: customer.acceptsMarketing,
      customerGroup: customer.customerGroup,
      taxExempt: customer.taxExempt,
      loyaltyPoints: customer.loyaltyPoints,
      totalOrders: customer.totalOrders,
      totalSpentMinor: customer.totalSpentMinor,
      averageOrderMinor: customer.averageOrderMinor,
      tags: customer.tags,
      notes: customer.notes,
      createdAt: customer.createdAt.toISOString(),
      updatedAt: customer.updatedAt.toISOString(),
    };
  }

  addressToResponse(address: CustomerAddressEntity): AddressResponse {
    return {
      id: address.publicId,
      label: address.label,
      type: address.type,
      recipientName: address.recipientName,
      phone: address.phoneE164,
      addressLine1: address.addressLine1,
      addressLine2: address.addressLine2,
      landmark: address.landmark,
      city: address.city,
      stateCode: address.stateCode,
      stateName: address.stateName,
      postalCode: address.postalCode,
      countryCode: address.countryCode,
      isDefaultShipping: address.isDefaultShipping,
      isDefaultBilling: address.isDefaultBilling,
      createdAt: address.createdAt.toISOString(),
    };
  }

  wishlistItemToResponse(item: { productId: string; variantId: string | null; addedAt: Date }): WishlistItemResponse {
    return {
      productId: item.productId,
      variantId: item.variantId,
      addedAt: item.addedAt.toISOString(),
    };
  }

  private async mustResolveStore(storePublicId: string): Promise<string> {
    const storeId = await this.customers.resolveStoreId(storePublicId);
    if (!storeId) throw new ConflictError(`Store '${storePublicId}' not found`);
    return storeId;
  }

  private async defaultStoreId(): Promise<string> {
    const storeId = await this.customers.defaultStoreId();
    if (!storeId) throw new ConflictError('This tenant has no store to attach the customer to');
    return storeId;
  }
}
