"use client";

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useUser, getAccessToken } from "@auth0/nextjs-auth0";
import Header from '../../components/header';
import Footer from '../../components/footer';
import BarcodeScanner from '../../components/barcode';
import { Plus, Scan, Camera, Search, X, ShoppingBag, ExternalLink, Trash2, ChevronDown, ChevronUp, Edit, Save } from 'lucide-react';
import { toast } from 'react-hot-toast';

export default function PantryPage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useUser();
  
  // Pantry items state
  const [pantryItems, setPantryItems] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedCategories, setExpandedCategories] = useState({});
  const [editingItem, setEditingItem] = useState(null);
  const [editForm, setEditForm] = useState({
    name: '',
    quantity: 1,
    category: '',
    expiry_date: ''
  });
  
  // Barcode scanner state
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [scannedBarcode, setScannedBarcode] = useState(null);
  const [scannedProduct, setScannedProduct] = useState(null);
  const [isScanning, setIsScanning] = useState(false);
  
  // Recipe recommendations state
  const [showRecommendations, setShowRecommendations] = useState(false);
  const [recommendations, setRecommendations] = useState([]);
  const [isLoadingRecommendations, setIsLoadingRecommendations] = useState(false);
  
  // Add item modal state
  const [showAddItemModal, setShowAddItemModal] = useState(false);
  const [newItemForm, setNewItemForm] = useState({
    name: '',
    quantity: 1,
    category: 'Other',
    expiry_date: ''
  });
  
  useEffect(() => {
    if (!authLoading && user) {
      fetchPantryItems();
    }
  }, [user, authLoading]);
  
  const fetchPantryItems = async () => {
    try {
      setIsLoading(true);
      
      const token = await getAccessToken({
        authorizationParams: {
          audience: "https://grovli.citigrove.com/audience"
        }
      });
      
      const apiUrl = process.env.NEXT_PUBLIC_API_URL;
      const response = await fetch(`${apiUrl}/api/user-pantry/items`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch pantry items');
      }
      
      const data = await response.json();
      setPantryItems(data.items || []);
      
      // Initialize expanded states for categories
      const categories = {};
      (data.items || []).forEach(item => {
        if (item.category) {
          categories[item.category] = false; // Start with all categories collapsed
        }
      });
      setExpandedCategories(categories);
      
    } catch (error) {
      console.error('Error fetching pantry items:', error);
      toast.error('Failed to load your pantry items');
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleAddItem = async () => {
    try {
      if (!newItemForm.name.trim()) {
        toast.error('Item name is required');
        return;
      }
      
      const token = await getAccessToken({
        authorizationParams: {
          audience: "https://grovli.citigrove.com/audience"
        }
      });
      
      const apiUrl = process.env.NEXT_PUBLIC_API_URL;
      const response = await fetch(`${apiUrl}/api/user-pantry/add-item`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(newItemForm)
      });
      
      if (!response.ok) {
        throw new Error('Failed to add pantry item');
      }
      
      const newItem = await response.json();
      setPantryItems(prev => [...prev, newItem]);
      setShowAddItemModal(false);
      setNewItemForm({
        name: '',
        quantity: 1,
        category: 'Other',
        expiry_date: ''
      });
      
      toast.success('Item added to pantry');
      
    } catch (error) {
      console.error('Error adding pantry item:', error);
      toast.error('Failed to add item to pantry');
    }
  };
  
  const handleUpdateItem = async () => {
    try {
      if (!editForm.name.trim()) {
        toast.error('Item name is required');
        return;
      }
      
      const token = await getAccessToken({
        authorizationParams: {
          audience: "https://grovli.citigrove.com/audience"
        }
      });
      
      const apiUrl = process.env.NEXT_PUBLIC_API_URL;
      const response = await fetch(`${apiUrl}/api/user-pantry/items/${editingItem.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(editForm)
      });
      
      if (!response.ok) {
        throw new Error('Failed to update pantry item');
      }
      
      const updatedItem = await response.json();
      setPantryItems(prev => prev.map(item => 
        item.id === editingItem.id ? updatedItem : item
      ));
      
      setEditingItem(null);
      toast.success('Item updated successfully');
      
    } catch (error) {
      console.error('Error updating pantry item:', error);
      toast.error('Failed to update item');
    }
  };
  
  const handleDeleteItem = async (itemId) => {
    try {
      const token = await getAccessToken({
        authorizationParams: {
          audience: "https://grovli.citigrove.com/audience"
        }
      });
      
      const apiUrl = process.env.NEXT_PUBLIC_API_URL;
      const response = await fetch(`${apiUrl}/api/user-pantry/items/${itemId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (!response.ok) {
        throw new Error('Failed to delete pantry item');
      }
      
      setPantryItems(prev => prev.filter(item => item.id !== itemId));
      toast.success('Item removed from pantry');
      
    } catch (error) {
      console.error('Error deleting pantry item:', error);
      toast.error('Failed to remove item');
    }
  };
  
  const handleLookupBarcode = async (barcode) => {
    try {
      setIsScanning(true);
      
      const apiUrl = process.env.NEXT_PUBLIC_API_URL;
      const response = await fetch(`${apiUrl}/api/user-pantry/lookup-barcode`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ barcode })
      });
      
      if (!response.ok) {
        throw new Error('Failed to lookup barcode');
      }
      
      const data = await response.json();
      
      if (data.found) {
        setScannedProduct(data.product);
        // Pre-populate the add item form
        setNewItemForm({
          name: data.product.name || '',
          barcode: data.product.barcode,
          quantity: 1,
          category: data.product.category || 'Other',
          nutritional_info: data.product.nutritional_info || {},
          image_url: data.product.image_url || ''
        });
        setShowAddItemModal(true);
      } else {
        toast.error('Product not found. Please add it manually.');
        setNewItemForm({
          name: '',
          barcode: barcode,
          quantity: 1,
          category: 'Other'
        });
        setShowAddItemModal(true);
      }
      
    } catch (error) {
      console.error('Error looking up barcode:', error);
      toast.error('Failed to lookup barcode');
    } finally {
      setIsScanning(false);
      setIsScannerOpen(false);
    }
  };
  
  const handleGetRecommendations = async () => {
    try {
      setIsLoadingRecommendations(true);
      
      const token = await getAccessToken({
        authorizationParams: {
          audience: "https://grovli.citigrove.com/audience"
        }
      });
      
      // Get ingredient names from pantry items
      const ingredients = pantryItems.map(item => item.name);
      
      const apiUrl = process.env.NEXT_PUBLIC_API_URL;
      const response = await fetch(`${apiUrl}/api/user-pantry/recommend-meals`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ ingredients })
      });
      
      if (!response.ok) {
        throw new Error('Failed to get meal recommendations');
      }
      
      const data = await response.json();
      setRecommendations(data.recommendations || []);
      setShowRecommendations(true);
      
    } catch (error) {
      console.error('Error getting meal recommendations:', error);
      toast.error('Failed to get meal recommendations');
    } finally {
      setIsLoadingRecommendations(false);
    }
  };
  
  // Group items by category
  const itemsByCategory = {};
  pantryItems.forEach(item => {
    const category = item.category || 'Other';
    if (!itemsByCategory[category]) {
      itemsByCategory[category] = [];
    }
    itemsByCategory[category].push(item);
  });
  
  // Filter items based on search query
  const filteredCategories = Object.keys(itemsByCategory).filter(category => {
    if (!searchQuery) return true;
    // Check if category matches search
    if (category.toLowerCase().includes(searchQuery.toLowerCase())) return true;
    // Check if any item in category matches search
    return itemsByCategory[category].some(item => 
      item.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
  });

  // Get category icon
  const getCategoryIcon = (category) => {
    // This is a simple example - you can expand with more icons based on your categories
    return <ShoppingBag className="w-4 h-4" />;
  };
  
  return (
    <div className="min-h-screen bg-white">
    <Header />
    
    {/* App Content - Below Header */}
    <div className="pt-24 px-4 pb-16 max-w-4xl mx-auto">
      {/* App Title and Add Button Row */}
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-semibold text-gray-800">
          My Pantry
        </h2>
        <div className="flex space-x-2">
          <button 
            onClick={() => setIsScannerOpen(true)}
            className="bg-teal-50 p-2 rounded-full text-teal-600 hover:bg-teal-100 transition"
            title="Scan Barcode"
          >
            <Scan className="w-5 h-5" />
          </button>
          <button 
            onClick={() => setShowAddItemModal(true)}
            className="bg-teal-500 text-white p-2 rounded-full hover:bg-teal-600 transition-colors"
            title="Add Item Manually"
          >
            <Plus className="w-5 h-5" />
          </button>
        </div>
      </div>
      
      {/* Search and Recipe Ideas */}
      <div className="mb-6">
        <div className="flex gap-2">
          <div className="relative flex-grow">
            <input
              type="text"
              placeholder="Search your pantry..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-gray-100 pl-10 pr-4 py-3 rounded-lg border-none focus:ring-2 focus:ring-teal-500"
            />
            {searchQuery && (
              <button
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                onClick={() => setSearchQuery('')}
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
          <button
            onClick={handleGetRecommendations}
            disabled={isLoadingRecommendations || pantryItems.length === 0}
            className={`px-4 py-2 rounded-lg font-medium bg-teal-500 text-white min-w-max 
              ${pantryItems.length === 0 ? 'opacity-50 cursor-not-allowed' : 'hover:bg-teal-600'} 
              transition flex items-center justify-center`}
          >
            {isLoadingRecommendations ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
            ) : (
              <ExternalLink className="w-4 h-4 mr-2" />
            )}
            Recipe Ideas
          </button>
        </div>
      </div>
        
        {/* Main Content */}
        <div>
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-16">
              <div className="w-12 h-12 border-4 border-teal-200 border-t-teal-600 rounded-full animate-spin"></div>
              <p className="mt-4 text-gray-500">Loading your pantry...</p>
            </div>
          ) : pantryItems.length === 0 ? (
            <div className="bg-white rounded-lg p-8 flex flex-col items-center justify-center text-center">
              <ShoppingBag className="w-16 h-16 text-gray-300 mb-4" />
              <h3 className="text-xl font-semibold text-gray-700 mb-2">Your pantry is empty</h3>
              <p className="text-gray-500 mb-6 max-w-md">
                Add ingredients to your pantry to keep track of what you have on hand and get personalized meal recommendations.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setIsScannerOpen(true)}
                  className="px-4 py-3 bg-teal-50 text-teal-600 rounded-lg hover:bg-teal-100 transition flex items-center justify-center"
                >
                  <Scan className="w-4 h-4 mr-2" />
                  Scan Barcode
                </button>
                <button
                  onClick={() => setShowAddItemModal(true)}
                  className="px-4 py-3 bg-teal-500 text-white rounded-lg hover:bg-teal-600 transition flex items-center justify-center"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add Manually
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredCategories.length === 0 ? (
                <div className="py-12 text-center text-gray-500">
                  No items match your search
                </div>
              ) : (
                filteredCategories.map(category => (
                  <div key={category} className="border border-gray-100 rounded-lg overflow-hidden">
                    <div 
                      className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-gray-50 transition"
                      onClick={() => setExpandedCategories(prev => ({
                        ...prev,
                        [category]: !prev[category]
                      }))}
                    >
                      <div className="flex items-center">
                        <div className="w-7 h-7 flex items-center justify-center rounded-full bg-teal-50 text-teal-600 mr-3">
                          <ShoppingBag className="w-4 h-4" />
                        </div>
                        <h3 className="font-medium text-gray-800 capitalize">
                          {category}
                        </h3>
                        <span className="ml-2 px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded-full">
                          {itemsByCategory[category].length}
                        </span>
                      </div>
                      <div className="text-gray-400">
                        {expandedCategories[category] ? (
                          <ChevronUp className="w-5 h-5" />
                        ) : (
                          <ChevronDown className="w-5 h-5" />
                        )}
                      </div>
                    </div>
                    
                    {expandedCategories[category] && (
                      <div className="border-t border-gray-100">
                        <div className="p-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {itemsByCategory[category]
                            .filter(item => !searchQuery || item.name.toLowerCase().includes(searchQuery.toLowerCase()))
                            .map(item => (
                              <div 
                                key={item.id} 
                                className={`p-3 rounded-lg ${
                                  editingItem?.id === item.id 
                                    ? 'bg-teal-50 border border-teal-100' 
                                    : 'hover:bg-gray-50 border border-gray-100'
                                } transition`}
                              >
                                {editingItem?.id === item.id ? (
                                  // Edit mode
                                  <div className="space-y-2">
                                    <input
                                      type="text"
                                      value={editForm.name}
                                      onChange={(e) => setEditForm({...editForm, name: e.target.value})}
                                      className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                                      placeholder="Item name"
                                    />
                                    <div className="flex space-x-2">
                                      <div className="flex-1">
                                        <label className="block text-xs text-gray-500 mb-1">Quantity</label>
                                        <input
                                          type="number"
                                          value={editForm.quantity}
                                          onChange={(e) => setEditForm({...editForm, quantity: parseInt(e.target.value) || 1})}
                                          min="1"
                                          className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                                        />
                                      </div>
                                      <div className="flex-1">
                                        <label className="block text-xs text-gray-500 mb-1">Category</label>
                                        <select
                                          value={editForm.category || 'Other'}
                                          onChange={(e) => setEditForm({...editForm, category: e.target.value})}
                                          className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                                        >
                                          <option value="Produce">Produce</option>
                                          <option value="Dairy">Dairy</option>
                                          <option value="Meat">Meat</option>
                                          <option value="Seafood">Seafood</option>
                                          <option value="Bakery">Bakery</option>
                                          <option value="Pantry">Pantry</option>
                                          <option value="Frozen">Frozen</option>
                                          <option value="Beverages">Beverages</option>
                                          <option value="Snacks">Snacks</option>
                                          <option value="Condiments">Condiments</option>
                                          <option value="Spices">Spices</option>
                                          <option value="Other">Other</option>
                                        </select>
                                      </div>
                                    </div>
                                    <div className="flex space-x-2 pt-2">
                                      <button
                                        onClick={handleUpdateItem}
                                        className="flex-1 py-2 bg-teal-500 text-white rounded-lg hover:bg-teal-600 transition flex items-center justify-center"
                                      >
                                        <Save className="w-4 h-4 mr-1" />
                                        Save
                                      </button>
                                      <button
                                        onClick={() => setEditingItem(null)}
                                        className="flex-1 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition flex items-center justify-center"
                                      >
                                        <X className="w-4 h-4 mr-1" />
                                        Cancel
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  // View mode
                                  <div>
                                    <div className="flex justify-between items-start">
                                      <div>
                                        <h4 className="font-medium text-gray-800">{item.name}</h4>
                                        <div className="mt-1 flex items-center">
                                          <span className="text-sm text-gray-500">Qty: {item.quantity}</span>
                                          {item.expiry_date && (
                                            <span className="ml-3 text-sm text-orange-500">Expires: {item.expiry_date}</span>
                                          )}
                                        </div>
                                      </div>
                                      <div className="flex space-x-1">
                                        <button
                                          onClick={() => {
                                            setEditingItem(item);
                                            setEditForm({
                                              name: item.name,
                                              quantity: item.quantity || 1,
                                              category: item.category || 'Other',
                                              expiry_date: item.expiry_date || ''
                                            });
                                          }}
                                          className="p-1.5 text-gray-400 hover:text-teal-500 hover:bg-teal-50 rounded transition"
                                          title="Edit Item"
                                        >
                                          <Edit className="w-4 h-4" />
                                        </button>
                                        <button
                                          onClick={() => {
                                            if (confirm('Are you sure you want to remove this item?')) {
                                              handleDeleteItem(item.id);
                                            }
                                          }}
                                          className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition"
                                          title="Remove Item"
                                        >
                                          <Trash2 className="w-4 h-4" />
                                        </button>
                                      </div>
                                    </div>
                                    {item.image_url && (
                                      <img
                                        src={item.image_url}
                                        alt={item.name}
                                        className="h-16 object-contain mt-2 rounded"
                                      />
                                    )}
                                  </div>
                                )}
                              </div>
                            ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
      
      {/* Floating Action Button */}
      <div className="fixed bottom-6 right-6">
        <button 
          onClick={() => setShowAddItemModal(true)}
          className="w-14 h-14 bg-teal-500 text-white rounded-full shadow-lg hover:bg-teal-600 transition flex items-center justify-center"
        >
          <Plus className="w-6 h-6" />
        </button>
      </div>
      
      {/* Barcode Scanner Modal */}
      {isScannerOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-xl max-w-md w-full p-6 m-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-semibold text-gray-800">Scan Barcode</h3>
              <button
                onClick={() => setIsScannerOpen(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="mb-4">
              <p className="text-gray-600 mb-2">Scan a product barcode to add it to your pantry.</p>
              
              {/* BarcodeScanner component */}
              <div className="mt-4">
                <BarcodeScanner 
                  onDetected={(barcode) => {
                    setScannedBarcode(barcode);
                    handleLookupBarcode(barcode);
                  }}
                  onClose={() => setIsScannerOpen(false)}
                />
              </div>
              
              <div className="text-center mt-4">
                <p className="text-gray-500 mb-2">— OR —</p>
                <div className="flex items-center mt-2">
                  <input
                    type="text"
                    placeholder="Enter barcode manually"
                    className="flex-1 p-2 border rounded-l-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                    value={scannedBarcode || ''}
                    onChange={(e) => setScannedBarcode(e.target.value)}
                  />
                  <button
                    onClick={() => handleLookupBarcode(scannedBarcode)}
                    disabled={!scannedBarcode || isScanning}
                    className={`px-4 py-2 rounded-r-lg ${
                      !scannedBarcode || isScanning
                        ? 'bg-gray-200 text-gray-500'
                        : 'bg-teal-500 text-white hover:bg-teal-600'
                    }`}
                  >
                    {isScanning ? 'Searching...' : 'Lookup'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      
     {/* Add Item Modal */}
     {showAddItemModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-xl max-w-md w-full p-6 m-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-semibold text-gray-800">
                {scannedProduct ? 'Add Scanned Item' : 'Add Item Manually'}
              </h3>
              <button
                onClick={() => {
                  setShowAddItemModal(false);
                  setScannedProduct(null);
                  setScannedBarcode(null);
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="space-y-4">
              {scannedProduct && scannedProduct.image_url && (
                <div className="flex justify-center">
                  <img
                    src={scannedProduct.image_url}
                    alt={scannedProduct.name}
                    className="h-32 object-contain rounded"
                  />
                </div>
              )}
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Item Name</label>
                <input
                  type="text"
                  value={newItemForm.name}
                  onChange={(e) => setNewItemForm({...newItemForm, name: e.target.value})}
                  className="w-full p-3 border rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500"
                  placeholder="e.g., Milk, Eggs, Bread"
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Quantity</label>
                  <input
                    type="number"
                    value={newItemForm.quantity}
                    onChange={(e) => setNewItemForm({...newItemForm, quantity: parseInt(e.target.value) || 1})}
                    min="1"
                    className="w-full p-3 border rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                  <select
                    value={newItemForm.category}
                    onChange={(e) => setNewItemForm({...newItemForm, category: e.target.value})}
                    className="w-full p-3 border rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500"
                  >
                    <option value="Produce">Produce</option>
                    <option value="Dairy">Dairy</option>
                    <option value="Meat">Meat</option>
                    <option value="Seafood">Seafood</option>
                    <option value="Bakery">Bakery</option>
                    <option value="Pantry">Pantry</option>
                    <option value="Frozen">Frozen</option>
                    <option value="Beverages">Beverages</option>
                    <option value="Snacks">Snacks</option>
                    <option value="Condiments">Condiments</option>
                    <option value="Spices">Spices</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>
              
              <button
                onClick={handleAddItem}
                className="w-full py-3 bg-teal-500 text-white font-medium rounded-lg hover:bg-teal-600 transition flex items-center justify-center"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add to Pantry
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Recipe Recommendations Modal */}
      {showRecommendations && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-xl max-w-lg w-full p-6 m-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-semibold text-gray-800">Recipe Ideas</h3>
              <button
                onClick={() => setShowRecommendations(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            
            {recommendations.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <p>No recipe recommendations available.</p>
                <p className="mt-2">Try adding more ingredients to your pantry.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {recommendations.map((recipe, index) => (
                  <div key={index} className="border border-gray-100 rounded-lg overflow-hidden">
                    <div className="bg-teal-50 px-4 py-3 border-b border-teal-100">
                      <h4 className="font-semibold text-teal-800">{recipe.name}</h4>
                    </div>
                    <div className="p-4">
                      {recipe.ingredients && (
                        <div className="mb-4">
                          <p className="font-medium text-gray-700 mb-1">Ingredients:</p>
                          <p className="text-gray-600">{recipe.ingredients}</p>
                        </div>
                      )}
                      {recipe.instructions && (
                        <div className="mb-4">
                          <p className="font-medium text-gray-700 mb-1">Instructions:</p>
                          <p className="text-gray-600">{recipe.instructions}</p>
                        </div>
                      )}
                      {recipe.calories && (
                        <div>
                          <p className="font-medium text-gray-700 mb-1">Calories:</p>
                          <p className="text-gray-600">{recipe.calories}</p>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
      
      <Footer />
    </div>
  );
}