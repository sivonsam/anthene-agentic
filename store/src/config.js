// Azure AD B2C MSAL configuration
// Fill in after infra deploy

export const msalConfig = {
  auth: {
    clientId: import.meta.env.VITE_B2C_CLIENT_ID || 'dev-mode',
    authority: import.meta.env.VITE_B2C_AUTHORITY ||
      'https://antheneagentic.b2clogin.com/antheneagentic.onmicrosoft.com/B2C_1_signup_signin',
    knownAuthorities: [
      import.meta.env.VITE_B2C_KNOWN_AUTHORITY || 'antheneagentic.b2clogin.com',
    ],
    redirectUri: window.location.origin,
  },
  cache: {
    cacheLocation: 'sessionStorage',
    storeAuthStateInCookie: false,
  },
}

export const loginRequest = {
  scopes: [
    `https://${import.meta.env.VITE_B2C_TENANT || 'antheneagentic'}.onmicrosoft.com/api/user_impersonation`,
  ],
}

export const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'
export const DEV_MODE = !import.meta.env.VITE_B2C_CLIENT_ID
