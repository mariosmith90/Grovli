// pages/_app.js
import '../styles/globals.css';
import { Auth0Provider, useAuth0 } from '@auth0/auth0-react';
import { UserProvider } from '@auth0/nextjs-auth0';
import Head from 'next/head';
import { useEffect, useState, useRef } from 'react';
import jwtDecode from 'jwt-decode';
import BottomNavbar from '../components/navbar'; // if needed

// AutoLogoutOnExpiry Component
function AutoLogoutOnExpiry() {
  const { logout, getAccessTokenSilently, isAuthenticated } = useAuth0();
  const timeoutRef = useRef(null);

  useEffect(() => {
    const scheduleLogout = async () => {
      try {
        // Only schedule if the user is authenticated.
        if (!isAuthenticated) return;
        // Retrieve the access token silently
        const token = await getAccessTokenSilently();
        // Decode the token to extract the expiration timestamp
        const { exp } = jwtDecode(token);
        const currentTime = Math.floor(Date.now() / 1000);
        const delay = (exp - currentTime) * 1000; // convert to milliseconds
        
        // Schedule logout if the token hasn't already expired
        if (delay > 0) {
          timeoutRef.current = setTimeout(() => {
            logout({ returnTo: window.location.origin });
          }, delay);
        }
      } catch (error) {
        console.error('Error scheduling auto logout:', error);
      }
    };

    scheduleLogout();

    // Clean up the timer if the component unmounts or dependencies change
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [isAuthenticated, getAccessTokenSilently, logout]);

  return null;
}

function MyApp({ Component, pageProps }) {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  
  useEffect(() => {
    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);
  
  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        console.log('App installed');
      }
      setDeferredPrompt(null);
    }
  };
  
  return (
    <UserProvider>
      <Auth0Provider
        domain={process.env.NEXT_PUBLIC_AUTH0_DOMAIN}
        clientId={process.env.NEXT_PUBLIC_AUTH0_CLIENT_ID}
        authorizationParams={{
          redirect_uri: typeof window !== 'undefined' ? window.location.origin : '',
          audience: process.env.NEXT_PUBLIC_AUTH0_AUDIENCE,
          scope: 'openid profile email read:users',
        }}
      >
        {/* AutoLogoutOnExpiry ensures the user is logged out when the token expires */}
        <AutoLogoutOnExpiry />
        
        <Head>
          <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
          <meta name="description" content="Your AI-powered meal planning assistant" />
          <meta name="theme-color" content="#008080" />
          <link rel="apple-touch-icon" href="/icons/icon-192x192.png" />
          <meta name="mobile-web-app-capable" content="yes" />
          <meta name="apple-mobile-web-app-capable" content="yes" />
          <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        </Head>
        
        <div className="min-h-screen">
          {deferredPrompt && (
            <button
              onClick={handleInstallClick}
              className="fixed bottom-24 right-4 bg-teal-500 text-white px-4 py-2 rounded-full shadow-md z-50"
            >
              Install App
            </button>
          )}
          
          <Component {...pageProps} />
          {/* Optionally include a bottom navbar */}
          <BottomNavbar />
        </div>
      </Auth0Provider>
    </UserProvider>
  );
}

export default MyApp;