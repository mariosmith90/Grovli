"use client";
import { useAuth } from '../contexts/AuthContext';

// Class-based API service for non-hook contexts
export class ApiService {
  constructor(accessToken) {
    this.accessToken = accessToken;
    this.apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || '';
  }

  async makeRequest(endpoint, options = {}) {
    if (!this.accessToken) throw new Error("Access token not available");
    
    try {
      const response = await fetch(`${this.apiBaseUrl}${endpoint}`, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.accessToken}`,
          ...(options.headers || {})
        }
      });
      
      if (!response.ok) throw new Error(`API error: ${response.status}`);
      return await response.json();
    } catch (error) {
      console.error(`API request failed: ${error.message}`);
      throw error;
    }
  }
}

// Hook for component contexts
export function useApiService() {
  const auth = useAuth();
  const getToken = auth?.getAuthToken;
  
  const makeAuthenticatedRequest = async (endpoint, options = {}) => {
    let token;
    
    try {
      // Try to get token from auth context first
      if (getToken) {
        token = await getToken();
      }
      
      // If we still don't have a token, try localStorage
      if (!token && typeof window !== 'undefined') {
        token = localStorage.getItem('accessToken');
      }
      
      if (!token) throw new Error("No access token available");
      
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';
      const response = await fetch(`${apiUrl}${endpoint}`, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          ...(options.headers || {})
        }
      });
      
      if (!response.ok) throw new Error(`API error: ${response.status}`);
      return await response.json();
    } catch (error) {
      console.error(`API request failed: ${error.message}`);
      throw error;
    }
  };
  
  return { makeAuthenticatedRequest };
}