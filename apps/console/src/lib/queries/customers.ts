import type {
  AddressRequest,
  AddressResponse,
  CreateCustomerRequest,
  CustomerListQuery,
  CustomerResponse,
  UpdateAddressRequest,
  UpdateCustomerRequest,
  WishlistItemResponse,
} from '@ems/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiDelete, apiGet, apiGetPaginated, apiPost, apiPut } from '@/lib/api-client';

export interface CustomerFilters {
  page: number;
  limit: number;
  status?: CustomerListQuery['status'];
}

const CUSTOMERS_KEY = 'customers';

export function useCustomers(filters: CustomerFilters) {
  return useQuery({
    queryKey: [CUSTOMERS_KEY, filters],
    queryFn: () =>
      apiGetPaginated<CustomerResponse>('/console/customers', {
        params: { page: filters.page, limit: filters.limit, status: filters.status || undefined },
      }),
    placeholderData: (previous) => previous,
  });
}

export function useCustomer(id: string | undefined) {
  return useQuery({
    queryKey: [CUSTOMERS_KEY, id],
    queryFn: () => apiGet<CustomerResponse>(`/console/customers/${id}`),
    enabled: Boolean(id),
  });
}

export function useCreateCustomer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateCustomerRequest) => apiPost<CustomerResponse>('/console/customers', body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [CUSTOMERS_KEY] });
    },
  });
}

export function useUpdateCustomer(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateCustomerRequest) => apiPut<CustomerResponse>(`/console/customers/${id}`, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [CUSTOMERS_KEY] });
    },
  });
}

// ---------------------------------------------------------------------------
// Addresses
// ---------------------------------------------------------------------------

export function useCustomerAddresses(customerId: string | undefined) {
  return useQuery({
    queryKey: [CUSTOMERS_KEY, customerId, 'addresses'],
    queryFn: () => apiGet<AddressResponse[]>(`/console/customers/${customerId}/addresses`),
    enabled: Boolean(customerId),
  });
}

export function useAddAddress(customerId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: AddressRequest) => apiPost<AddressResponse>(`/console/customers/${customerId}/addresses`, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [CUSTOMERS_KEY, customerId, 'addresses'] });
    },
  });
}

export function useUpdateAddress(customerId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ addressId, body }: { addressId: string; body: UpdateAddressRequest }) =>
      apiPut<AddressResponse>(`/console/customers/${customerId}/addresses/${addressId}`, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [CUSTOMERS_KEY, customerId, 'addresses'] });
    },
  });
}

export function useRemoveAddress(customerId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (addressId: string) => apiDelete(`/console/customers/${customerId}/addresses/${addressId}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [CUSTOMERS_KEY, customerId, 'addresses'] });
    },
  });
}

// ---------------------------------------------------------------------------
// Wishlist
// ---------------------------------------------------------------------------

export function useCustomerWishlist(customerId: string | undefined) {
  return useQuery({
    queryKey: [CUSTOMERS_KEY, customerId, 'wishlist'],
    queryFn: () => apiGet<WishlistItemResponse[]>(`/console/customers/${customerId}/wishlist`),
    enabled: Boolean(customerId),
  });
}

export function useAddWishlistItem(customerId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { productId: string; variantId?: string }) =>
      apiPost<{ message: string }>(`/console/customers/${customerId}/wishlist`, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [CUSTOMERS_KEY, customerId, 'wishlist'] });
    },
  });
}

export function useRemoveWishlistItem(customerId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ productId, variantId }: { productId: string; variantId?: string }) =>
      apiDelete(`/console/customers/${customerId}/wishlist/${productId}`, { params: { variantId } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [CUSTOMERS_KEY, customerId, 'wishlist'] });
    },
  });
}
