import type { PaginationMeta } from '@restaurant-os/types';

export function buildPaginationMeta(
  page: number,
  pageSize: number,
  total: number,
): PaginationMeta {
  return {
    page,
    pageSize,
    total,
    totalPages: pageSize > 0 ? Math.ceil(total / pageSize) : 0,
  };
}

export function paginationArgs(page: number, pageSize: number) {
  return { skip: (page - 1) * pageSize, take: pageSize };
}
