import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiDelete, apiGet, apiPost } from '@/lib/api-client';

const CMS_KEY = 'cms-pages';
const BLOG_KEY = 'blog-posts';

export interface CmsPageSummary {
  id: string;
  slug: string;
  title: string;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  body?: string;
  publishedAt: string | null;
  createdAt: string;
}

export interface BlogPostSummary {
  id: string;
  slug: string;
  title: string;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  publishedAt: string | null;
  createdAt: string;
}

export function useCmsPages(storeId?: string) {
  return useQuery<CmsPageSummary[]>({
    queryKey: [CMS_KEY, storeId ?? 'all'],
    queryFn: () =>
      apiGet<CmsPageSummary[] | { items: CmsPageSummary[] }>('/console/cms/pages', {
        params: storeId ? { storeId } : undefined,
      }).then((res) => (Array.isArray(res) ? res : res?.items ?? [])),
  });
}

export function useCreateCmsPage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { title: string; slug: string; body: string; storeId?: string }) =>
      apiPost<CmsPageSummary>('/console/cms/pages', body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [CMS_KEY] });
    },
  });
}

export function usePublishCmsPage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiPost<CmsPageSummary>(`/console/cms/pages/${id}/publish`, {}),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [CMS_KEY] });
    },
  });
}

export function useDeleteCmsPage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete<{ message: string }>(`/console/cms/pages/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [CMS_KEY] });
    },
  });
}

export function useBlogPosts(storeId?: string) {
  return useQuery<BlogPostSummary[]>({
    queryKey: [BLOG_KEY, storeId ?? 'all'],
    queryFn: () =>
      apiGet<BlogPostSummary[] | { items: BlogPostSummary[] }>('/console/blog/posts', {
        params: storeId ? { storeId } : undefined,
      }).then((res) => (Array.isArray(res) ? res : res?.items ?? [])),
  });
}
