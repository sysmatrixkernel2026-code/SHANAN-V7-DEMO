// ============================================================
// SHANAN Engineering Knowledge Platform â€” Catalog Data Access
// Central data-access layer that fetches from the Bun API.
//
// This module replaces the old mockData.ts-based layer with
// real API calls to /api/products, /api/categories, /api/brands.
// The canonical product master lives in SQLite (via the API).
// ============================================================

import type { Product, Category, Brand, PaginatedResult, CatalogFilters } from '../types';

const API_URL = import.meta.env.VITE_API_URL ?? '';

// ---- Sync ID lookups (cached for performance) ----
let _categoriesCache: Category[] | null = null;
let _brandsCache: Brand[] | null = null;

export async function fetchCategoriesFromApi(): Promise<Category[]> {
  if (_categoriesCache) return _categoriesCache;
  try {
    const res = await fetch(`${API_URL}/api/categories`);
    if (!res.ok) return [];
    const data = await res.json();
    _categoriesCache = (data.categories || []).map((cat: Category) => ({ ...cat, image: cat.image ? (/^https?:\/\//i.test(cat.image) ? cat.image : API_URL + (cat.image.startsWith('/') ? cat.image : '/' + cat.image)) : cat.image })) as Category[];
    return _categoriesCache;
  } catch {
    return [];
  }
}

export async function fetchBrandsFromApi(): Promise<Brand[]> {
  if (_brandsCache) return _brandsCache;
  try {
    const res = await fetch(`${API_URL}/api/brands`);
    if (!res.ok) return [];
    const data = await res.json();
    _brandsCache = (data.brands || []) as Brand[];
    return _brandsCache;
  } catch {
    return [];
  }
}

// ---- Async fetch helpers (used by Catalog page) ----
export async function fetchProducts(filters: CatalogFilters): Promise<PaginatedResult<Product>> {
  const params = new URLSearchParams();
  params.set('page', String(filters.page));
  params.set('pageSize', String(filters.pageSize));
  if (filters.search) params.set('search', filters.search);
  if (filters.categoryId) params.set('categoryId', filters.categoryId);
  if (filters.brandId) params.set('brandId', filters.brandId);
  if (filters.availability) params.set('availability', filters.availability);
  params.set('sortBy', filters.sortBy);

  try {
    const res = await fetch(`${API_URL}/api/products?${params.toString()}`);
    if (!res.ok) return { items: [], total: 0, page: filters.page, pageSize: filters.pageSize, totalPages: 1 };
    const data = await res.json();
    return {
      items: (data.items || []) as Product[],
      total: data.total || 0,
      page: data.page || filters.page,
      pageSize: data.pageSize || filters.pageSize,
      totalPages: data.totalPages || 1,
    };
  } catch {
    return { items: [], total: 0, page: filters.page, pageSize: filters.pageSize, totalPages: 1 };
  }
}

export async function fetchProductById(id: string): Promise<Product | null> {
  try {
    const res = await fetch(`${API_URL}/api/products/${id}`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.product as Product;
  } catch {
    return null;
  }
}

export async function fetchProductBySlug(slug: string): Promise<Product | null> {
  // The API resolves by id, slug, or sku â€” so slug works directly
  return fetchProductById(slug);
}

// ---- Sync ID lookups (for backward compatibility) ----
// These use the cached API data. If the cache hasn't been loaded yet,
// they return undefined (callers should use the async versions).
export function getCategoryById(id: string): Category | undefined {
  return _categoriesCache?.find(c => c.id === id);
}

export function getBrandById(id: string): Brand | undefined {
  return _brandsCache?.find(b => b.id === id);
}

export function getProductById(id: string): Product | undefined {
  // Sync lookup is no longer possible with API-backed data.
  // Callers should use fetchProductById() instead.
  return undefined;
}

// ---- Computed product counts ----
export function getProductCountByCategory(categoryId: string): number {
  // With API-backed data, product counts come from the API response.
  // This function is kept for backward compatibility but returns 0
  // if the cache hasn't been loaded.
  return 0;
}

export function getProductCountByBrand(brandId: string): number {
  return 0;
}

// ---- Enriched views ----
export async function getCategoriesWithCounts(): Promise<Category[]> {
  return fetchCategoriesFromApi();
}

export async function getBrandsWithCounts(): Promise<Brand[]> {
  return fetchBrandsFromApi();
}

// ---- Legacy synchronous exports (for backward compat with old imports) ----
// These are empty arrays â€” consumers should use the async fetch* functions.
export const categories: Category[] = [];
export const brands: Brand[] = [];
export const products: Product[] = [];

