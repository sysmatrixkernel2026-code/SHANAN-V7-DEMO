import { createContext, useContext, useState, ReactNode } from 'react';
import type { SupplyRequestItem } from '../types';

interface SupplyRequestContextValue {
  items: SupplyRequestItem[];
  addItem: (item: SupplyRequestItem) => void;
  removeItem: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  updateNotes: (productId: string, notes: string) => void;
  clearItems: () => void;
  itemCount: number;
}

const SupplyRequestContext = createContext<SupplyRequestContextValue | undefined>(undefined);

export function SupplyRequestProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<SupplyRequestItem[]>([]);

  const addItem = (item: SupplyRequestItem) => {
    setItems(prev => {
      const existing = prev.find(i => i.productId === item.productId);
      if (existing) {
        return prev.map(i =>
          i.productId === item.productId
            ? { ...i, quantity: i.quantity + item.quantity }
            : i
        );
      }
      return [...prev, item];
    });
  };

  const removeItem = (productId: string) => {
    setItems(prev => prev.filter(i => i.productId !== productId));
  };

  const updateQuantity = (productId: string, quantity: number) => {
    if (quantity < 1) return;
    setItems(prev => prev.map(i =>
      i.productId === productId ? { ...i, quantity } : i
    ));
  };

  const updateNotes = (productId: string, notes: string) => {
    setItems(prev => prev.map(i =>
      i.productId === productId ? { ...i, notes } : i
    ));
  };

  const clearItems = () => setItems([]);

  const itemCount = items.length;

  return (
    <SupplyRequestContext.Provider
      value={{ items, addItem, removeItem, updateQuantity, updateNotes, clearItems, itemCount }}
    >
      {children}
    </SupplyRequestContext.Provider>
  );
}

export function useSupplyRequest(): SupplyRequestContextValue {
  const ctx = useContext(SupplyRequestContext);
  if (!ctx) throw new Error('useSupplyRequest must be used within SupplyRequestProvider');
  return ctx;
}
