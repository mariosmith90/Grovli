"use client";

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { getAuthState } from './authStore';

/**
 * Pantry Store using Zustand
 * Manages pantry items state and caching to improve performance
 */
export const usePantryStore = create(
  persist(
    (set, get) => ({
      // State
      items: [],
      categories: {},
      isLoading: false,
      error: null,
      lastUpdated: null,
      
      // Loading status for optimistic UI
      loadingStates: {
        fetchPantry: false,
        addItem: false,
        updateItem: false,
        deleteItem: false
      },
      
      // Optimistic UI tracking
      pendingOperations: [],
      
      // Actions
      setItems: (items) => {
        // Extract categories from items for easier filtering
        const categories = {};
        items.forEach(item => {
          const category = item.category || 'Other';
          if (!categories[category]) {
            categories[category] = false; // Start with all categories collapsed
          }
        });
        
        set({ 
          items, 
          categories,
          lastUpdated: new Date().toISOString()
        });
      },
      
      setLoading: (isLoading) => {
        set({ isLoading });
      },
      
      setError: (error) => {
        set({ error });
      },
      
      setLoadingState: (operation, isLoading) => {
        set(state => ({
          loadingStates: {
            ...state.loadingStates,
            [operation]: isLoading
          }
        }));
      },
      
      toggleCategory: (category) => {
        set(state => ({
          categories: {
            ...state.categories,
            [category]: !state.categories[category]
          }
        }));
      },
      
      expandAllCategories: () => {
        const expandedCategories = {};
        Object.keys(get().categories).forEach(category => {
          expandedCategories[category] = true;
        });
        set({ categories: expandedCategories });
      },
      
      collapseAllCategories: () => {
        const collapsedCategories = {};
        Object.keys(get().categories).forEach(category => {
          collapsedCategories[category] = false;
        });
        set({ categories: collapsedCategories });
      },
      
      // API Operations
      fetchPantryItems: async () => {
        // Check if we've loaded data recently (within last 2 minutes)
        const lastUpdated = get().lastUpdated;
        if (lastUpdated) {
          const now = new Date();
          const lastUpdateTime = new Date(lastUpdated);
          const diff = now - lastUpdateTime;
          // If data was loaded less than 2 minutes ago, don't fetch again
          if (diff < 2 * 60 * 1000) {
            console.log("[PantryStore] Using cached data from the last 2 minutes");
            return get().items;
          }
        }
        
        const auth = getAuthState();
        if (!auth.userId) {
          console.warn("[PantryStore] Can't fetch pantry items without user ID");
          return [];
        }
        
        try {
          set({ isLoading: true, error: null });
          get().setLoadingState('fetchPantry', true);
          
          const token = auth.getAuthToken();
          const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';
          
          const response = await fetch(`${apiUrl}/api/user-pantry/items`, {
            headers: {
              'Authorization': `Bearer ${token}`,
              'user-id': auth.userId
            }
          });
          
          if (!response.ok) {
            throw new Error(`Failed to fetch pantry items: ${response.status}`);
          }
          
          const data = await response.json();
          
          // Update state with the fetched items
          get().setItems(data.items || []);
          
          return data.items || [];
        } catch (error) {
          console.error('Error fetching pantry items:', error);
          set({ error: error.message });
          return [];
        } finally {
          set({ isLoading: false });
          get().setLoadingState('fetchPantry', false);
        }
      },
      
      addItem: async (newItem) => {
        const auth = getAuthState();
        
        try {
          // Optimistic update
          get().setLoadingState('addItem', true);
          
          // Add a temporary ID so we can track this item
          const tempItem = { 
            ...newItem, 
            id: `temp-${Date.now()}`,
            isOptimistic: true
          };
          
          // Add to state immediately for better UX
          set(state => ({
            items: [...state.items, tempItem],
            pendingOperations: [...state.pendingOperations, {
              type: 'add',
              item: tempItem
            }]
          }));
          
          const token = auth.getAuthToken();
          const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';
          
          const response = await fetch(`${apiUrl}/api/user-pantry/add-item`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`,
              'user-id': auth.userId
            },
            body: JSON.stringify(newItem)
          });
          
          if (!response.ok) {
            throw new Error(`Failed to add pantry item: ${response.status}`);
          }
          
          const addedItem = await response.json();
          
          // Replace the temp item with the real one
          set(state => ({
            items: state.items.map(item => 
              item.id === tempItem.id ? addedItem : item
            ),
            pendingOperations: state.pendingOperations.filter(op => 
              !(op.type === 'add' && op.item.id === tempItem.id)
            ),
            lastUpdated: new Date().toISOString()
          }));
          
          return addedItem;
        } catch (error) {
          console.error('Error adding pantry item:', error);
          
          // Revert optimistic update
          set(state => ({
            items: state.items.filter(item => !item.isOptimistic),
            pendingOperations: state.pendingOperations.filter(op => 
              !(op.type === 'add' && op.item.isOptimistic)
            ),
            error: error.message
          }));
          
          throw error;
        } finally {
          get().setLoadingState('addItem', false);
        }
      },
      
      updateItem: async (itemId, updatedData) => {
        const auth = getAuthState();
        
        try {
          // Optimistic update
          get().setLoadingState('updateItem', true);
          
          // Get the current item
          const currentItem = get().items.find(item => item.id === itemId);
          if (!currentItem) {
            throw new Error('Item not found');
          }
          
          // Update state immediately for better UX
          set(state => ({
            items: state.items.map(item => 
              item.id === itemId ? { ...item, ...updatedData, isUpdating: true } : item
            ),
            pendingOperations: [...state.pendingOperations, {
              type: 'update',
              itemId,
              originalItem: currentItem
            }]
          }));
          
          const token = auth.getAuthToken();
          const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';
          
          const response = await fetch(`${apiUrl}/api/user-pantry/items/${itemId}`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`,
              'user-id': auth.userId
            },
            body: JSON.stringify(updatedData)
          });
          
          if (!response.ok) {
            throw new Error(`Failed to update pantry item: ${response.status}`);
          }
          
          const updatedItem = await response.json();
          
          // Update with the server response
          set(state => ({
            items: state.items.map(item => 
              item.id === itemId ? { ...updatedItem, isUpdating: false } : item
            ),
            pendingOperations: state.pendingOperations.filter(op => 
              !(op.type === 'update' && op.itemId === itemId)
            ),
            lastUpdated: new Date().toISOString()
          }));
          
          return updatedItem;
        } catch (error) {
          console.error('Error updating pantry item:', error);
          
          // Revert optimistic update
          set(state => {
            const operation = state.pendingOperations.find(
              op => op.type === 'update' && op.itemId === itemId
            );
            
            return {
              items: state.items.map(item => 
                item.id === itemId ? (operation?.originalItem || item) : item
              ),
              pendingOperations: state.pendingOperations.filter(op => 
                !(op.type === 'update' && op.itemId === itemId)
              ),
              error: error.message
            };
          });
          
          throw error;
        } finally {
          get().setLoadingState('updateItem', false);
        }
      },
      
      deleteItem: async (itemId) => {
        const auth = getAuthState();
        
        try {
          // Optimistic update
          get().setLoadingState('deleteItem', true);
          
          // Get the current item before removing it
          const itemToDelete = get().items.find(item => item.id === itemId);
          if (!itemToDelete) {
            throw new Error('Item not found');
          }
          
          // Remove from state immediately for better UX
          set(state => ({
            items: state.items.filter(item => item.id !== itemId),
            pendingOperations: [...state.pendingOperations, {
              type: 'delete',
              itemId,
              deletedItem: itemToDelete
            }]
          }));
          
          const token = auth.getAuthToken();
          const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';
          
          const response = await fetch(`${apiUrl}/api/user-pantry/items/${itemId}`, {
            method: 'DELETE',
            headers: {
              'Authorization': `Bearer ${token}`,
              'user-id': auth.userId
            }
          });
          
          if (!response.ok) {
            throw new Error(`Failed to delete pantry item: ${response.status}`);
          }
          
          // Remove from pending operations
          set(state => ({
            pendingOperations: state.pendingOperations.filter(op => 
              !(op.type === 'delete' && op.itemId === itemId)
            ),
            lastUpdated: new Date().toISOString()
          }));
          
          return true;
        } catch (error) {
          console.error('Error deleting pantry item:', error);
          
          // Revert optimistic update
          set(state => {
            const operation = state.pendingOperations.find(
              op => op.type === 'delete' && op.itemId === itemId
            );
            
            return {
              items: operation?.deletedItem 
                ? [...state.items, operation.deletedItem] 
                : state.items,
              pendingOperations: state.pendingOperations.filter(op => 
                !(op.type === 'delete' && op.itemId === itemId)
              ),
              error: error.message
            };
          });
          
          throw error;
        } finally {
          get().setLoadingState('deleteItem', false);
        }
      },
      
      // Search and filtering
      filterItemsByCategory: (category) => {
        return get().items.filter(item => 
          (item.category || 'Other') === category
        );
      },
      
      searchItems: (query) => {
        if (!query) return get().items;
        
        query = query.toLowerCase();
        return get().items.filter(item => 
          item.name.toLowerCase().includes(query) ||
          (item.category || '').toLowerCase().includes(query)
        );
      },
      
      // Check if data is stale and needs refresh
      isDataStale: () => {
        const lastUpdated = get().lastUpdated;
        if (!lastUpdated) return true;
        
        const now = new Date();
        const lastUpdateTime = new Date(lastUpdated);
        const diff = now - lastUpdateTime;
        
        // If data is older than 5 minutes, consider it stale
        return diff > 5 * 60 * 1000;
      },
      
      // Get all unique categories
      getAllCategories: () => {
        const categories = [];
        get().items.forEach(item => {
          const category = item.category || 'Other';
          if (!categories.includes(category)) {
            categories.push(category);
          }
        });
        return categories;
      },
      
      // Group items by category (for rendering)
      getItemsByCategory: () => {
        const itemsByCategory = {};
        get().items.forEach(item => {
          const category = item.category || 'Other';
          if (!itemsByCategory[category]) {
            itemsByCategory[category] = [];
          }
          itemsByCategory[category].push(item);
        });
        return itemsByCategory;
      },
      
      // Reset store (useful for logout)
      resetStore: () => {
        set({
          items: [],
          categories: {},
          isLoading: false,
          error: null,
          lastUpdated: null,
          loadingStates: {
            fetchPantry: false,
            addItem: false,
            updateItem: false,
            deleteItem: false
          },
          pendingOperations: []
        });
      }
    }),
    {
      name: 'grovli-pantry',
      storage: createJSONStorage(() => typeof window !== 'undefined' ? localStorage : null),
      skipHydration: true,
      partialize: (state) => ({
        items: state.items,
        categories: state.categories,
        lastUpdated: state.lastUpdated
      }),
    }
  )
);

// Hook for accessing pantry state in components
export const usePantry = () => {
  // Get the store state
  const store = usePantryStore();
  
  // Force the store to hydrate if not already hydrated
  if (typeof window !== 'undefined' && !usePantryStore.persist.hasHydrated()) {
    usePantryStore.persist.rehydrate();
  }
  
  return {
    // State
    items: store.items,
    categories: store.categories,
    isLoading: store.isLoading,
    error: store.error,
    loadingStates: store.loadingStates,
    
    // Actions
    fetchPantryItems: store.fetchPantryItems,
    addItem: store.addItem,
    updateItem: store.updateItem,
    deleteItem: store.deleteItem,
    
    // Category management
    toggleCategory: store.toggleCategory,
    expandAllCategories: store.expandAllCategories,
    collapseAllCategories: store.collapseAllCategories,
    
    // Search and filtering
    filterItemsByCategory: store.filterItemsByCategory,
    searchItems: store.searchItems,
    getAllCategories: store.getAllCategories,
    getItemsByCategory: store.getItemsByCategory,
    
    // Utility functions
    isDataStale: store.isDataStale,
    resetStore: store.resetStore
  };
};

// For non-React contexts
export const getPantryState = () => {
  if (typeof window === 'undefined') {
    return {
      items: [],
      categories: {},
      isLoading: false,
      error: null
    };
  }
  
  return usePantryStore.getState();
};