"use client";

import { useEffect, useState, Suspense } from "react";
import { useUser } from "@auth0/nextjs-auth0";
import { useRouter, useSearchParams } from "next/navigation";

export default function Subscriptions() {
  const router = useRouter();

  return (
    <Suspense fallback={<div>Loading...</div>}>
      <SubscriptionsContent router={router} />
    </Suspense>
  );
}

function SubscriptionsContent({ router }) {
  const searchParams = useSearchParams(); // ✅ Now inside Suspense
  const { user, isLoading, checkSession } = useUser(); // ✅ Ensure Auth0 session refresh
  const [loading, setLoading] = useState(false);
  const [isPro, setIsPro] = useState(false);

  // ✅ Check if user is Pro on page load
  useEffect(() => {
    if (!user?.email) return;

    const checkSubscription = async () => {
      setLoading(true);
      try {
        const response = await fetch(`http://localhost:4242/auth0/user-subscription`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: user.email }),
        });

        const data = await response.json();
        if (data.subscription === "pro") {
          setIsPro(true);
        }
      } catch (error) {
        console.error("Error checking subscription:", error);
      }
      setLoading(false);
    };

    checkSubscription();
  }, [user]);

  // ✅ Handle redirect after Stripe Payment
  useEffect(() => {
    const status = searchParams.get("status");

    if (status === "success" && user?.email) {
      setLoading(true);

      fetch("/api/auth/me", { method: "GET", cache: "no-store" })
        .then(() => checkSession()) // ✅ Ensures Auth0 updates user data in frontend
        .then(() => {
          fetch(`http://localhost:4242/auth0/user-subscription`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: user.email }),
          })
            .then((res) => res.json())
            .then((data) => {
              if (data.subscription === "pro") {
                setIsPro(true);
              }
            });
        })
        .catch((err) => console.error("❌ Error refreshing Auth0 session:", err))
        .finally(() => setLoading(false));
    }
  }, [searchParams, user, checkSession]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-100 p-6">
      <div className="text-gray-900 text-5xl font-bold mb-8 cursor-pointer" onClick={() => router.push('/home')}>
        Grovli
      </div>

      <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-3xl">
        <h2 className="text-3xl font-bold text-center text-gray-900 mb-4">Choose Your Plan</h2>
        <p className="text-gray-600 text-center mb-6">Unlock premium meal planning features with Grovli Pro.</p>

        <div className="grid grid-cols-2 border rounded-lg overflow-hidden">
          {/* Free Plan */}
          <div className="p-6 bg-gray-50 text-center">
            <h3 className="text-2xl font-bold text-gray-900">Free Plan</h3>
            <p className="text-gray-600 mb-4">Basic features for casual users</p>
            <p className="text-3xl font-bold text-gray-900 mb-4">Free</p>
            <ul className="text-gray-700 text-left space-y-2">
              <li>✔️ Generate meal plans (1 day only)</li>
              <li>✔️ Limited meal customization</li>
              <li>❌ No grocery list integration</li>
              <li>❌ No personalized macros</li>
            </ul>
            <button onClick={() => router.push('/')} className="mt-6 w-full py-2 px-4 text-white bg-gray-500 rounded-lg hover:bg-gray-600">
              Continue with Free Plan
            </button>
          </div>

          {/* Pro Plan */}
          <div className="p-6 bg-white text-center border-l">
            <h3 className="text-2xl font-bold text-gray-900">Pro Plan</h3>
            <p className="text-gray-600 mb-4">Unlock full access & expert guidance</p>
            <p className="text-3xl font-bold text-gray-900 mb-4">$50/month</p>
            <ul className="text-gray-700 text-left space-y-2">
              <li>✔️ All Free Plan features</li>
              <li>✔️ AI-powered personalized macros</li>
              <li>✔️ Grocery list integration</li>
            </ul>
            {isPro ? (
              <p className="mt-6 text-green-600 font-bold">✅ You are already a Pro user!</p>
            ) : (
              <a href="https://buy.stripe.com/test_fZe17S3tEayq9fWdQR" target="_blank" className="mt-6 block w-full py-2 px-4 text-white bg-blue-600 rounded-lg hover:bg-blue-700">
                Upgrade to Pro
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}