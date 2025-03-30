// app/layout.js
import '../styles/globals.css';
import Head from 'next/head';
import BottomNavbar from '../components/ui/navbar';
import Header from '../components/ui/header';
import { MealGenerationProvider } from '../contexts/MealGenerationContext';

export const metadata = {
  title: 'Meal Plan App',
  description: 'Your AI-powered meal planning assistant',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="description" content="Your AI-powered meal planning assistant" />
        <meta name="theme-color" content="#008080" />
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/icons/icon-192x192.png" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
      </Head>
      <body>
        <MealGenerationProvider>
          <Header />
          <BottomNavbar>
            {children}
          </BottomNavbar>
        </MealGenerationProvider>
      </body>
    </html>
  );
}