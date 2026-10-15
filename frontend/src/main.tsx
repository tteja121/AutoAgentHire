import { createRoot } from "react-dom/client";
import { GoogleOAuthProvider } from "@react-oauth/google";
import App from "./App.tsx";
import "./index.css";

const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim() || "";

if (!googleClientId || googleClientId === "PASTE_YOUR_GOOGLE_CLIENT_ID_HERE") {
  console.warn(
    "[Google OAuth] VITE_GOOGLE_CLIENT_ID is not configured in .env.local. Google Sign-In will be disabled until a valid Client ID is provided."
  );
}

createRoot(document.getElementById("root")!).render(
  <GoogleOAuthProvider clientId={googleClientId}>
    <App />
  </GoogleOAuthProvider>
);
