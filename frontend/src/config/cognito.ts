import type { AuthProviderProps } from 'react-oidc-context';

export const COGNITO_CONFIG = {
  userPoolId: 'us-east-1_Yqc7bshFl',
  clientId: '4nee5d2ou8jp3pvrabg7qn52rq',
  region: 'us-east-1',
  domain: 'https://us-east-1yqc7bshfl.auth.us-east-1.amazoncognito.com',
  authority: 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_Yqc7bshFl',
  redirectUri: 'https://d27x5bphqn4glk.cloudfront.net',
  scope: 'phone openid email',
  responseType: 'code',
};

/**
 * Returns allowed redirect URI depending on current environment (CloudFront vs Localhost)
 */
export const getRedirectUri = (): string => {
  if (typeof window === 'undefined') return COGNITO_CONFIG.redirectUri;
  return window.location.origin;
};

export const cognitoAuthConfig: AuthProviderProps = {
  authority: COGNITO_CONFIG.authority,
  client_id: COGNITO_CONFIG.clientId,
  redirect_uri: typeof window !== 'undefined' ? getRedirectUri() : COGNITO_CONFIG.redirectUri,
  response_type: COGNITO_CONFIG.responseType,
  scope: COGNITO_CONFIG.scope,
  onSigninCallback: () => {
    // Strip code and state query parameters from URL after successful Cognito redirect
    window.history.replaceState({}, document.title, window.location.pathname);
  },
};

/**
 * Initiates AWS Cognito Managed Login Hosted UI logout
 */
export const getSignOutUrl = (logoutUri = getRedirectUri()): string => {
  return `${COGNITO_CONFIG.domain}/logout?client_id=${COGNITO_CONFIG.clientId}&logout_uri=${encodeURIComponent(logoutUri)}`;
};
