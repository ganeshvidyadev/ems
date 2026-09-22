'use client';

import React, { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import type { CustomerResponse, CustomerLoginRequest, CustomerRegisterRequest } from '@ems/contracts';
import { api, ApiError } from './api-client';

interface CustomerContextValue {
  customer: CustomerResponse | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (credentials: CustomerLoginRequest) => Promise<void>;
  register: (data: CustomerRegisterRequest) => Promise<void>;
  logout: () => Promise<void>;
  refreshCustomer: () => Promise<void>;
}

const CustomerContext = createContext<CustomerContextValue | undefined>(undefined);

export function CustomerProvider({ children }: { children: ReactNode }) {
  const [customer, setCustomer] = useState<CustomerResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshCustomer = useCallback(async () => {
    try {
      const data = await api.request<CustomerResponse>('auth/me');
      setCustomer(data);
    } catch {
      setCustomer(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshCustomer();
  }, [refreshCustomer]);

  const login = useCallback(async (credentials: CustomerLoginRequest) => {
    setIsLoading(true);
    try {
      const res = await api.request<{ accessToken: string; customer: CustomerResponse }>('auth/login', {
        method: 'POST',
        body: credentials,
      });
      setCustomer(res.customer);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const register = useCallback(async (data: CustomerRegisterRequest) => {
    setIsLoading(true);
    try {
      const res = await api.request<{ accessToken: string; customer: CustomerResponse }>('auth/register', {
        method: 'POST',
        body: data,
      });
      setCustomer(res.customer);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    setIsLoading(true);
    try {
      await api.request('auth/logout', { method: 'POST' });
    } catch {
      // Ignore logout errors and clear state
    } finally {
      setCustomer(null);
      setIsLoading(false);
    }
  }, []);

  return (
    <CustomerContext.Provider
      value={{
        customer,
        isLoading,
        isAuthenticated: customer !== null,
        login,
        register,
        logout,
        refreshCustomer,
      }}
    >
      {children}
    </CustomerContext.Provider>
  );
}

export function useCustomer(): CustomerContextValue {
  const context = useContext(CustomerContext);
  if (!context) {
    throw new Error('useCustomer must be used within a CustomerProvider');
  }
  return context;
}
