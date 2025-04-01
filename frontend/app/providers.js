"use client";

// In v4.0.2, Auth0 integration is primarily handled through middleware
// and server components instead of requiring a client provider
import { AuthProvider } from '../contexts/AuthContext';
import { MealGenerationProvider } from '../contexts/MealGenerationContext';

export function Providers({ children }) {
  return (
    <AuthProvider>
      <MealGenerationProvider>
        {children}
      </MealGenerationProvider>
    </AuthProvider>
  );
}