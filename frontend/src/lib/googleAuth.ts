/**
 * Google OAuth Configuration Helper
 * Safely inspects VITE_GOOGLE_CLIENT_ID without exposing secrets.
 * Ensures the Google OAuth Provider is never initialized with an empty or invalid client ID.
 */

export function getGoogleClientId(): string {
  const raw = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  if (!raw || typeof raw !== "string") {
    return "";
  }
  let trimmed = raw.trim();
  // Strip surrounding quotes if present in .env / .env.local
  trimmed = trimmed.replace(/^["']|["']$/g, "").trim();

  // Check for common unconfigured placeholders
  if (
    trimmed === "" ||
    trimmed.includes("PASTE_YOUR_GOOGLE_CLIENT_ID") ||
    trimmed.includes("your-google-client-id") ||
    trimmed.startsWith("your_")
  ) {
    return "";
  }
  return trimmed;
}

export function isGoogleOAuthConfigured(): boolean {
  return Boolean(getGoogleClientId());
}

