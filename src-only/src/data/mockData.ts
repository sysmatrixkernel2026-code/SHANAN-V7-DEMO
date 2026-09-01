// ============================================================
// SHANAN — Legacy mockData compatibility shim
//
// This file was previously the canonical product master source.
// It has been replaced by the persisted SQLite Product Master
// (see db/schema.sql — products, categories, brands tables).
//
// The canonical data access layer is now src/data/catalog.ts
// which fetches from the Bun API (/api/products, /api/categories,
// /api/brands).
//
// This file remains ONLY for backward compatibility with any
// code that still imports from mockData. It re-exports the
// async fetch functions from catalog.ts and provides empty
// arrays for the old synchronous exports.
//
// DO NOT add new product data here. All product data belongs
// in the SQLite database, managed via the API or bulk import.
// ============================================================

import type { Product, Category, Brand, PaginatedResult, CatalogFilters } from '../types';

// Re-export the API-backed fetch functions from catalog.ts
export {
  fetchProducts,
  fetchProductById,
  fetchProductBySlug,
  fetchCategoriesFromApi as fetchCategories,
  fetchBrandsFromApi as fetchBrands,
} from './catalog';

// Empty arrays — the old synchronous exports are no longer the data source.
// Consumers should use the async fetch* functions instead.
export const mockCategories: Category[] = [];
export const mockBrands: Brand[] = [];
export const mockProducts: Product[] = [];

// Re-export the sync lookup functions (which now return undefined/empty
// since data comes from the API asynchronously)
export { getCategoryById, getBrandById, getProductById } from './catalog';
