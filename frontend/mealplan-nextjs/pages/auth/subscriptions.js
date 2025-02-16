import { useRouter } from "next/router";

export default function Subscriptions() {
  const router = useRouter();

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-100 p-6">
      {/* Grovli Logo */}
      <div 
        className="text-gray-900 text-5xl font-bold mb-8 cursor-pointer"
        onClick={() => router.push('/home')}
      >
        Grovli
      </div>

      {/* Subscription Content */}
      <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-3xl">
        <h2 className="text-3xl font-bold text-center text-gray-900 mb-4">
          Choose Your Plan
        </h2>
        <p className="text-gray-600 text-center mb-6">
          Unlock premium meal planning features with Grovli Pro.
        </p>

        {/* Pricing Table */}
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
              <li>❌ No AI-powered nutrition insights</li>
              <li>❌ No private consultation</li>
            </ul>
            <button 
              onClick={() => router.push('/')}
              className="mt-6 w-full py-2 px-4 text-white bg-gray-500 rounded-lg hover:bg-gray-600"
            >
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
              <li>✔️ Unlimited meal plan days</li>
              <li>✔️ Exclusive Pro recipes</li>
              <li>✔️ Private consultation with a nutritionist</li>
            </ul>
            <a 
              href="https://buy.stripe.com/aEU7tX2yi6YRe9W3cg" 
              target="_blank"
              className="mt-6 block w-full py-2 px-4 text-white bg-blue-600 rounded-lg hover:bg-blue-700"
            >
              Upgrade to Pro
            </a>
          </div>
        </div>

        {/* Back to Home */}
        <p 
          className="text-gray-500 text-center mt-6 cursor-pointer hover:underline" 
          onClick={() => router.push('/home')}
        >
          Back to Home
        </p>
      </div>
    </div>
  );
}