# Session: AWS Cognito User Pool Integration (SEC-001 & INT-07)

- **Date:** 2026-10-25 01:50
- **Author:** Antigravity

## Goal
Integrate AWS Cognito User Pool (`us-east-1_Yqc7bshFl`) and App Client (`4nee5d2ou8jp3pvrabg7qn52rq`) with DooRare frontend (via `oidc-client-ts` and `react-oidc-context`) and backend (via `POST /api/v1/auth/cognito`).

## Done
- Installed `oidc-client-ts` and `react-oidc-context` in `frontend/`.
- Configured OIDC parameters in [frontend/src/config/cognito.ts](file:///c:/Users/EgqZ/Documents/GitHub/main/NTT-Data-DooRare/frontend/src/config/cognito.ts) using verified authority `https://cognito-idp.us-east-1.amazonaws.com/us-east-1_Yqc7bshFl` and domain `https://us-east-1yqc7bshfl.auth.us-east-1.amazoncognito.com`.
- Wrapped root React tree in `<CognitoAuthProvider>` in [frontend/src/main.tsx](file:///c:/Users/EgqZ/Documents/GitHub/main/NTT-Data-DooRare/frontend/src/main.tsx).
- Integrated Cognito auto-session synchronization in [frontend/src/context/AuthContext.tsx](file:///c:/Users/EgqZ/Documents/GitHub/main/NTT-Data-DooRare/frontend/src/context/AuthContext.tsx) and updated [frontend/src/services/authApi.ts](file:///c:/Users/EgqZ/Documents/GitHub/main/NTT-Data-DooRare/frontend/src/services/authApi.ts) (`loginWithCognito`).
- Added styled "เข้าสู่ระบบด้วย AWS Cognito (SSO)" button and error state in [frontend/src/pages/LoginPage.tsx](file:///c:/Users/EgqZ/Documents/GitHub/main/NTT-Data-DooRare/frontend/src/pages/LoginPage.tsx).
- Implemented `POST /api/v1/auth/cognito` endpoint and service in [backend/src/modules/auth/](file:///c:/Users/EgqZ/Documents/GitHub/main/NTT-Data-DooRare/backend/src/modules/auth/) to link real Cognito `sub` to `app_user.cognito_sub` and issue session tokens.
- Added unit tests in [backend/tests/cognito.test.ts](file:///c:/Users/EgqZ/Documents/GitHub/main/NTT-Data-DooRare/backend/tests/cognito.test.ts) (3/3 passing).
- Verified TypeScript compilation: frontend and backend exit 0.

## Decisions
- Used OIDC code flow (`response_type: 'code'`) with PKCE via `react-oidc-context` (standard AWS Cognito Managed Login recommendations).
- Bridged authenticated Cognito sessions with DooRare's PostgreSQL `app_user` table, mapping role and hospital tenancy automatically.

## Files Touched
- [frontend/package.json](file:///c:/Users/EgqZ/Documents/GitHub/main/NTT-Data-DooRare/frontend/package.json)
- [frontend/src/config/cognito.ts](file:///c:/Users/EgqZ/Documents/GitHub/main/NTT-Data-DooRare/frontend/src/config/cognito.ts)
- [frontend/src/main.tsx](file:///c:/Users/EgqZ/Documents/GitHub/main/NTT-Data-DooRare/frontend/src/main.tsx)
- [frontend/src/context/AuthContext.tsx](file:///c:/Users/EgqZ/Documents/GitHub/main/NTT-Data-DooRare/frontend/src/context/AuthContext.tsx)
- [frontend/src/services/authApi.ts](file:///c:/Users/EgqZ/Documents/GitHub/main/NTT-Data-DooRare/frontend/src/services/authApi.ts)
- [frontend/src/pages/LoginPage.tsx](file:///c:/Users/EgqZ/Documents/GitHub/main/NTT-Data-DooRare/frontend/src/pages/LoginPage.tsx)
- [backend/src/modules/auth/auth.repository.ts](file:///c:/Users/EgqZ/Documents/GitHub/main/NTT-Data-DooRare/backend/src/modules/auth/auth.repository.ts)
- [backend/src/modules/auth/auth.service.ts](file:///c:/Users/EgqZ/Documents/GitHub/main/NTT-Data-DooRare/backend/src/modules/auth/auth.service.ts)
- [backend/src/modules/auth/auth.controller.ts](file:///c:/Users/EgqZ/Documents/GitHub/main/NTT-Data-DooRare/backend/src/modules/auth/auth.controller.ts)
- [backend/src/modules/auth/auth.routes.ts](file:///c:/Users/EgqZ/Documents/GitHub/main/NTT-Data-DooRare/backend/src/modules/auth/auth.routes.ts)
- [backend/tests/cognito.test.ts](file:///c:/Users/EgqZ/Documents/GitHub/main/NTT-Data-DooRare/backend/tests/cognito.test.ts)
- [backend/.env.example](file:///c:/Users/EgqZ/Documents/GitHub/main/NTT-Data-DooRare/backend/.env.example)

## Errors Encountered
- None.

## Next Steps
- Rebuild frontend dist and sync to S3 bucket (`doorare-frontend`).
- Invalidate CloudFront distribution cache for immediate user testing.
