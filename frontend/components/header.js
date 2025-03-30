"use client";
import { useRouter } from 'next/navigation';
import { Settings } from 'lucide-react';
import { useEffect, useState } from 'react';

export default function Header() {
  const router = useRouter();
  const [pathname, setPathname] = useState('');
  const [shouldShow, setShouldShow] = useState(false);

  // Get current path and set visibility on client side
  useEffect(() => {
    // Function to check current path and update state
    const checkPath = () => {
      const currentPath = window.location.pathname;
      setPathname(currentPath);
      // Check if header should be hidden
      const hidePaths = ['/settings', '/', '/onboarding'];
      const shouldHide = hidePaths.includes(currentPath);
      setShouldShow(!shouldHide);
    };

    // Check path immediately
    checkPath();

    // Add event listeners for path changes
    window.addEventListener('popstate', checkPath);
    const handleRouteChange = () => {
      setTimeout(checkPath, 100); // Small delay to ensure path has updated
    };
    document.addEventListener('click', handleRouteChange);

    // Cleanup listeners on unmount
    return () => {
      window.removeEventListener('popstate', checkPath);
      document.removeEventListener('click', handleRouteChange);
    };
  }, []);

  // Don't render if we shouldn't show
  if (!shouldShow) {
    return null;
  }

  return (
    <header className="fixed top-0 left-0 right-0 z-40 p-2 bg-white/90 backdrop-blur-sm flex items-center justify-between">
      {/* Logo Section */}
      <div 
        className="cursor-pointer"
        onClick={() => router.push('/')}
      >
        <img 
          src="/logo.png" 
          alt="App Logo" 
          className="h-16 w-auto" 
        />
      </div>

      {/* Settings Button */}
      <button 
        onClick={() => router.push('/settings')} 
        className="p-2 bg-white/90 backdrop-blur-sm hover:bg-white transition-colors text-gray-700 hover:text-teal-600" 
        aria-label="Settings"
      >
        <Settings className="w-6 h-6" />
      </button>
    </header>
  );
}