// ============================================================
// SHANAN Engineering Knowledge Platform — Data Models
// These interfaces define the shape of data the UI expects.
// They are designed to map directly to a future Laravel backend
// or Supabase database without UI redesign.
//
// PHASE 1 — Core Catalog Data Foundation:
//   - `Product.categoryId` MUST reference an existing Category.id
//   - `Product.brandId`   MUST reference an existing Brand.id
//   - All catalog access goes through `src/data/catalog.ts`
//   - Product counts on Category / Brand are computed live from
//     the products list (the raw `productCount` field is reserved
//     for backend hydration only — do not trust it as authoritative).
// ============================================================

export type Locale = 'ar' | 'en';

export interface LocalizedString {
  ar: string;
  en: string;
}

// ---- Category ----
export interface Category {
  id: string;
  slug: string;
  name: LocalizedString;
  description?: LocalizedString;
  parentId?: string | null;
  image?: string;
  productCount?: number;
}

// ---- Brand / Manufacturer ----
export interface Brand {
  id: string;
  slug: string;
  name: string;
  logo?: string;
  description?: LocalizedString;
  productCount?: number;
}

// ---- Product Image ----
export interface ProductImage {
  id: string;
  url: string;
  alt?: string;
  isPrimary?: boolean;
  sortOrder?: number;
}

// ---- Specification ----
export interface Specification {
  id: string;
  label: LocalizedString;
  value: LocalizedString;
  group?: LocalizedString;
}

// ---- Technical Metadata ----
export interface TechnicalMetadata {
  key: LocalizedString;
  value: string;
}

// ---- Document / Download ----
export interface ProductDocument {
  id: string;
  title: LocalizedString;
  url: string;
  fileType: 'pdf' | 'doc' | 'docx' | 'xls' | 'xlsx' | 'dwg' | 'other';
  fileSize?: string;
}

// ---- Product ----
export interface Product {
  id: string;
  sku: string;
  name: LocalizedString;
  description?: LocalizedString;
  categoryId: string;
  brandId?: string | null;
  brandName?: string | null;
  manufacturer?: string | null;
  images: ProductImage[];
  primaryImage?: string;
  specifications: Specification[];
  technicalMetadata: TechnicalMetadata[];
  documents: ProductDocument[];
  productInfo?: {
    barcode?: string | null;
    unit?: string | null;
    subCategory?: string | null;
  };
  availability: 'in_stock' | 'limited' | 'out_of_stock' | 'on_request';
  sellPrice?: number;
  currency?: string;
  category?: { name: LocalizedString; slug?: string };
  brand?: { name: string; slug?: string };
  // Timestamps for future backend sync
  createdAt?: string;
  updatedAt?: string;
}

// ---- Customer Company (Phase A1 Foundation) ----
// The Customer Company is the primary commercial B2B entity.
// Future phases will add Customer Users, Contacts, Credit Applications,
// and Purchase Orders as children referencing customer_company_id.
export type CustomerAccountStatus = 'pending' | 'active' | 'suspended' | 'rejected' | 'closed';
export type CustomerPaymentMode = 'cash' | 'credit';

export interface CustomerCompany {
  id: string;                    // Stable internal UUID (server-generated)
  reference: string;             // Official human-readable reference: CUS-YYYY-NNNNNN
  nameEn: string;                // English company name (required)
  nameAr?: string;               // Arabic company name (optional, bilingual support)
  email?: string;
  phone?: string;
  country?: string;
  city?: string;
  address?: string;
  taxId?: string;                // Business registration / tax identification
  accountStatus: CustomerAccountStatus;  // Independent from payment mode
  paymentMode: CustomerPaymentMode;      // Independent from account status
  createdAt: string;             // ISO timestamp
  updatedAt: string;             // ISO timestamp
}

// ---- Phase A2: Users, Roles & Access Foundation ----
// Two access domains: internal (SHANAN staff) and customer.
// Customer users are FK-linked to customer_companies.
// Internal users have companyId = null.
export type UserType = 'internal' | 'customer';
export type UserRole = 'admin' | 'manager' | 'employee' | 'customer_admin' | 'customer_user';

export interface User {
  id: string;                    // Stable internal UUID (server-generated)
  name: string;
  email: string;                 // Unique login identifier
  userType: UserType;             // 'internal' or 'customer'
  role: UserRole;                 // Role within their domain
  companyId?: string | null;      // NULL for internal users; FK to customer_companies.id for customer users
  isActive: boolean;              // Account active/inactive flag
  createdAt: string;
  updatedAt: string;
}

// ---- Phase A4: Credit Application Foundation ----
export type CreditApplicationStatus =
  | 'draft'
  | 'submitted'
  | 'under_review'
  | 'returned_for_correction'
  | 'approved'
  | 'rejected'
  | 'cancelled';

export interface CreditApplication {
  id: string;
  customerCompanyId: string;          // FK to customer_companies.id (NOT NULL — every application belongs to a company)
  applicationNumber: string;         // Unique human-readable: CR-YYYYMMDD-XXXXXX
  status: CreditApplicationStatus;
  requestedCreditLimit?: string;
  requestedPaymentTerms?: string;
  requestedPaymentMethod?: string;
  businessActivity?: string;
  companyRegistrationNumber?: string;
  taxNumber?: string;
  authorizedPersonName: string;
  authorizedPersonTitle?: string;
  authorizedPersonPhone?: string;
  authorizedPersonEmail?: string;
  requestedByUserId?: string | null;   // FK to users.id (nullable)
  submittedAt?: string | null;
  reviewedAt?: string | null;
  reviewedBy?: string | null;           // FK to users.id (nullable)
  approvalNotes?: string;
  rejectionReason?: string;
  createdAt: string;
  updatedAt: string;
}

// ---- Supply Request ----
export interface SupplyRequestItem {
  productId: string;
  productName: string;
  sku: string;
  quantity: number;
  notes?: string;
  // Optional transient UI fields (NOT persisted in SQLite — used for cart display + print only).
  // These are populated from the Product at addItem() time so the cart and printed
  // documents can show the image / category / brand without re-looking-up the catalog.
  // Older cart items (and existing SQLite rows) simply omit these — they are optional.
  productImage?: string;
  categoryId?: string;
  brandId?: string;
  brandName?: string;
  // Commercial continuity fields (also optional & transient) carried from the Product so the
  // Requested Item row can communicate unit / indicative unit price / currency. They are
  // display-only — the commercial model is quotation-based (final price quoted after review),
  // so unitPrice is INDICATIVE, never a binding contractual price.
  unit?: string | null;
  unitPrice?: number | null;
  currency?: string | null;
}

export interface SupplyRequest {
  id?: string;
  reference?: string;
  requesterName: string;
  companyName: string;
  email: string;
  phone: string;
  country: string;
  city: string;
  items: SupplyRequestItem[];
  message?: string;
  status?: 'pending' | 'reviewing' | 'quoted' | 'fulfilled' | 'rejected';
  createdAt?: string;
  // A3: Commercial ownership & linking fields (all optional — null for historical/unlinked requests)
  customerCompanyId?: string | null;       // FK to customer_companies.id (stable UUID)
  customerPoNumber?: string | null;        // Customer's own PO reference (separate from SHN reference)
  creditApplicationId?: string | null;     // Deferred future link (not yet implemented)
}

// ---- Filters / Query ----
export interface CatalogFilters {
  search: string;
  categoryId: string | null;
  brandId: string | null;
  availability: string | null;
  sortBy: 'name_asc' | 'name_desc' | 'sku_asc' | 'sku_desc' | 'newest';
  page: number;
  pageSize: number;
}

// ---- Paginated Result ----
export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  // Set when the request failed (network / non-2xx) — distinct from a
  // legitimate empty result so callers can render an error state.
  error?: boolean;
}
