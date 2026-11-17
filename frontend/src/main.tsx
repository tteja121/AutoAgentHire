import { createRoot } from "react-dom/client";
import { GoogleOAuthProvider } from "@react-oauth/google";
import App from "./App.tsx";
import "./index.css";
import { getGoogleClientId } from "./lib/googleAuth";

const googleClientId = getGoogleClientId();

if (!googleClientId) {
  console.warn(
    "[Google OAuth] VITE_GOOGLE_CLIENT_ID is not configured in .env.local. Google Sign-In is disabled and email/password login is active."
  );
}

createRoot(document.getElementById("root")!).render(
  googleClientId ? (
    <GoogleOAuthProvider clientId={googleClientId}>
      <App />
    </GoogleOAuthProvider>
  ) : (
    <App />
  )
);
