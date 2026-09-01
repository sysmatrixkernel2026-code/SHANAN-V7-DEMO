// ============================================================
// SHANAN — Activity Tracking Utility
// Lightweight frontend-to-backend event recording for
// meaningful business events (not click tracking).
// ============================================================

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const TOKEN_KEY = 'shanan_auth_token';

// Track a meaningful business event
export async function trackEvent(
  eventType: string,
  context?: {
    productId?: string;
    categoryId?: string;
    supplyRequestId?: string;
    agreementId?: string;
    rfqId?: string;
    metadata?: string;
  },
): Promise<void> {
  try {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return; // Don't track unauthenticated browsing

    await fetch(`${API_URL}/api/activity/events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ eventType, ...context }),
    });
    // Fire-and-forget — don't block the UI
  } catch {
    // Silently ignore — tracking should never break the UI
  }
}

// Convenience constants
export const ActivityEvents = {
  PLATFORM_SESSION_STARTED: 'PLATFORM_SESSION_STARTED',
  CATALOG_VIEWED: 'CATALOG_VIEWED',
  PRODUCT_VIEWED: 'PRODUCT_VIEWED',
  PRODUCT_SEARCHED: 'PRODUCT_SEARCHED',
  CATEGORY_VIEWED: 'CATEGORY_VIEWED',
  SUPPLY_REQUEST_STARTED: 'SUPPLY_REQUEST_STARTED',
  SUPPLY_REQUEST_SUBMITTED: 'SUPPLY_REQUEST_SUBMITTED',
  AGREEMENT_VIEWED: 'AGREEMENT_VIEWED',
  RFQ_CREATED: 'RFQ_CREATED',
  OFFER_RECORDED: 'OFFER_RECORDED',
  EVALUATION_VIEWED: 'EVALUATION_VIEWED',
  DECISION_RECORDED: 'DECISION_RECORDED',
} as const;
