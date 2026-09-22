import type {
  CreateTaxClassRequest,
  CreateTaxRateRequest,
  TaxClassResponse,
  TaxRateResponse,
  UpdateTaxClassRequest,
  UpdateTaxRateRequest,
} from '@ems/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiDelete, apiGet, apiPost, apiPut } from '@/lib/api-client';

const TAX_CLASSES_KEY = 'tax-classes';
const TAX_RATES_KEY = 'tax-rates';

export function useTaxClasses() {
  return useQuery({
    queryKey: [TAX_CLASSES_KEY],
    queryFn: () => apiGet<TaxClassResponse[]>('/console/tax/classes'),
  });
}

export function useCreateTaxClass() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateTaxClassRequest) =>
      apiPost<TaxClassResponse>('/console/tax/classes', body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [TAX_CLASSES_KEY] });
    },
  });
}

export function useUpdateTaxClass(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateTaxClassRequest) =>
      apiPut<TaxClassResponse>(`/console/tax/classes/${id}`, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [TAX_CLASSES_KEY] });
    },
  });
}

export function useDeleteTaxClass() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete<{ message: string }>(`/console/tax/classes/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [TAX_CLASSES_KEY] });
    },
  });
}

export function useTaxRates() {
  return useQuery({
    queryKey: [TAX_RATES_KEY],
    queryFn: () => apiGet<TaxRateResponse[]>('/console/tax/rates'),
  });
}

export function useCreateTaxRate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateTaxRateRequest) =>
      apiPost<TaxRateResponse>('/console/tax/rates', body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [TAX_RATES_KEY] });
    },
  });
}

export function useUpdateTaxRate(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateTaxRateRequest) =>
      apiPut<TaxRateResponse>(`/console/tax/rates/${id}`, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [TAX_RATES_KEY] });
    },
  });
}

export function useDeleteTaxRate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete<{ message: string }>(`/console/tax/rates/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [TAX_RATES_KEY] });
    },
  });
}
