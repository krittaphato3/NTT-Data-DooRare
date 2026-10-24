import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { useAuth as useCognitoAuth } from 'react-oidc-context';
import type { AuthUser, LoginCredentials, LoginResponse } from '../types/auth';
import type { RoleCode } from '../lib/rbac';
import * as authApi from '../services/authApi';

const STORAGE_KEY = 'doorare_auth_session';
const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes (SEC-001)

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  activeRole: RoleCode;
  isAuthenticated: boolean;
  isLoading: boolean;
  dbConnected: boolean;
  dbMessage: string;
  login: (credentials: LoginCredentials) => Promise<LoginResponse>;
  loginWithCognito: (payload: { email?: string; sub: string; idToken?: string }) => Promise<LoginResponse>;
  logout: () => Promise<void>;
  switchRole: (role: RoleCode) => void;
  refreshHealth: () => Promise<void>;
  cognitoAuth?: ReturnType<typeof useCognitoAuth>;
}

const defaultAuth: AuthContextValue = {
  user: null,
  token: null,
  activeRole: 'PHARMACIST',
  isAuthenticated: false,
  isLoading: false,
  dbConnected: false,
  dbMessage: '',
  login: async () => ({ ok: false }),
  loginWithCognito: async () => ({ ok: false }),
  logout: async () => {},
  switchRole: () => {},
  refreshHealth: async () => {},
};

const AuthContext = createContext<AuthContextValue>(defaultAuth);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const cognitoAuth = useCognitoAuth();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [activeRole, setActiveRole] = useState<RoleCode>('PHARMACIST');
  const [isLoading, setIsLoading] = useState(true);
  const [dbConnected, setDbConnected] = useState(false);
  const [dbMessage, setDbMessage] = useState('กำลังตรวจสอบการเชื่อมต่อฐานข้อมูล...');

  const lastActivityRef = useRef<number>(Date.now());

  // Auto-sync AWS Cognito authentication with DooRare session
  useEffect(() => {
    if (cognitoAuth.isAuthenticated && cognitoAuth.user?.profile && !user) {
      const email = cognitoAuth.user.profile.email;
      const sub = cognitoAuth.user.profile.sub || '';
      const idToken = cognitoAuth.user.id_token;

      authApi.loginWithCognito({ email, sub, idToken }).then((res) => {
        if (res.ok && res.user && res.token) {
          setUser(res.user);
          setToken(res.token);
          setActiveRole(res.user.role);
          const sessionData = JSON.stringify({
            user: res.user,
            token: res.token,
            activeRole: res.user.role,
          });
          sessionStorage.setItem(STORAGE_KEY, sessionData);
          localStorage.setItem(STORAGE_KEY, sessionData);
          setDbConnected(true);
          setDbMessage('เข้าสู่ระบบสำเร็จผ่าน AWS Cognito');
        }
      });
    }
  }, [cognitoAuth.isAuthenticated, cognitoAuth.user, user]);

  const refreshHealth = useCallback(async () => {
    const health = await authApi.checkHealth();
    setDbConnected(health.ok);
    setDbMessage(health.message);
  }, []);

  // Initialize session from localStorage or verify token
  useEffect(() => {
    let mounted = true;

    async function init() {
      await refreshHealth();

      const raw = sessionStorage.getItem(STORAGE_KEY) || localStorage.getItem(STORAGE_KEY);
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          if (parsed.user && parsed.token) {
            setUser(parsed.user);
            setToken(parsed.token);
            setActiveRole(parsed.activeRole || parsed.user.role);
            // Ensure this tab has its own copy in sessionStorage
            sessionStorage.setItem(STORAGE_KEY, raw);

            // Verify with /api/v1/me in background
            const fresh = await authApi.getMe(parsed.token);
            if (fresh && mounted) {
              setUser(fresh);
            }
          }
        } catch (e) {
          sessionStorage.removeItem(STORAGE_KEY);
          localStorage.removeItem(STORAGE_KEY);
        }
      }
      if (mounted) setIsLoading(false);
    }

    init();
    return () => {
      mounted = false;
    };
  }, [refreshHealth]);

  // SEC-001: 30-minute idle timeout
  useEffect(() => {
    if (!user) return;

    const onActivity = () => {
      lastActivityRef.current = Date.now();
    };

    const interval = setInterval(() => {
      if (Date.now() - lastActivityRef.current > IDLE_TIMEOUT_MS) {
        console.warn('[Auth] SEC-001: 30-minute idle timeout exceeded, logging out...');
        logout();
      }
    }, 60000);

    window.addEventListener('mousedown', onActivity);
    window.addEventListener('keydown', onActivity);
    window.addEventListener('touchstart', onActivity);

    return () => {
      clearInterval(interval);
      window.removeEventListener('mousedown', onActivity);
      window.removeEventListener('keydown', onActivity);
      window.removeEventListener('touchstart', onActivity);
    };
  }, [user]);

  const login = async (credentials: LoginCredentials): Promise<LoginResponse> => {
    const res = await authApi.login(credentials);
    if (res.ok && res.user && res.token) {
      setUser(res.user);
      setToken(res.token);
      setActiveRole(res.user.role);
      const sessionData = JSON.stringify({
        user: res.user,
        token: res.token,
        activeRole: res.user.role,
      });
      sessionStorage.setItem(STORAGE_KEY, sessionData);
      localStorage.setItem(STORAGE_KEY, sessionData);
      setDbConnected(true);
      setDbMessage('เชื่อมต่อฐานข้อมูล PostgreSQL สำเร็จ');
    }
    return res;
  };

  const loginWithCognito = async (payload: { email?: string; sub: string; idToken?: string }): Promise<LoginResponse> => {
    const res = await authApi.loginWithCognito(payload);
    if (res.ok && res.user && res.token) {
      setUser(res.user);
      setToken(res.token);
      setActiveRole(res.user.role);
      const sessionData = JSON.stringify({
        user: res.user,
        token: res.token,
        activeRole: res.user.role,
      });
      sessionStorage.setItem(STORAGE_KEY, sessionData);
      localStorage.setItem(STORAGE_KEY, sessionData);
      setDbConnected(true);
      setDbMessage('เข้าสู่ระบบสำเร็จผ่าน AWS Cognito');
    }
    return res;
  };

  const logout = async () => {
    if (token) {
      await authApi.logout(token);
    }
    if (cognitoAuth?.isAuthenticated) {
      await cognitoAuth.removeUser();
    }
    setUser(null);
    setToken(null);
    setActiveRole('PHARMACIST');
    sessionStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(STORAGE_KEY);
  };

  const switchRole = (newRole: RoleCode) => {
    if (!user) return;
    // Check if user has this role
    if (user.allRoles.includes(newRole) || user.role === 'SYSTEM_ADMIN') {
      setActiveRole(newRole);
      const sessionData = JSON.stringify({
        user,
        token,
        activeRole: newRole,
      });
      sessionStorage.setItem(STORAGE_KEY, sessionData);
      localStorage.setItem(STORAGE_KEY, sessionData);
    } else {
      console.warn(`[Auth] User does not have granted role: ${newRole}`);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        activeRole,
        isAuthenticated: !!user,
        isLoading,
        dbConnected,
        dbMessage,
        login,
        loginWithCognito,
        logout,
        switchRole,
        refreshHealth,
        cognitoAuth,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext) || defaultAuth;
}
