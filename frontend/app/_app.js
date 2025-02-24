import '../styles/globals.css';
import { Auth0Provider } from '@auth0/auth0-react'; // Import Auth0Provider

function MyApp({ Component, pageProps }) {
  return (
    <Auth0Provider
      domain={process.env.NEXT_PUBLIC_AUTH0_DOMAIN} // Your Auth0 domain
      clientId={process.env.NEXT_PUBLIC_AUTH0_CLIENT_ID} // Your Auth0 client ID
      authorizationParams={{
        redirect_uri: typeof window !== 'undefined' ? window.location.origin : '', // Redirect URL
        audience: process.env.NEXT_PUBLIC_AUTH0_AUDIENCE, // Your API audience
        scope: "openid profile email read:users", // Required scopes
      }}
    >
      <div className="min-h-screen">
        <Component {...pageProps} />
      </div>
    </Auth0Provider>
  );
}

export default MyApp;