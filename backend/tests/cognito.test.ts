import test from 'node:test';
import assert from 'node:assert/strict';
import { AuthService } from '../src/modules/auth/auth.service.js';

test('cognitoLogin: validates presence of sub or email', async () => {
  const service = new AuthService({} as any);
  const result = await service.cognitoLogin({ sub: '', email: '' });
  assert.equal(result.ok, false);
  assert.equal(result.status, 400);
  assert.equal(result.code, 'VALIDATION');
});

test('cognitoLogin: returns 401 USER_NOT_REGISTERED when account does not exist in DB', async () => {
  const mockRepo = {
    findUserByCognitoSub: async () => null,
    findUserByEmail: async () => null,
    recordLoginEvent: async () => 1,
  };

  const service = new AuthService(mockRepo as any);
  const result = await service.cognitoLogin({ sub: 'unknown-sub-12345', email: 'unknown@example.org' });
  assert.equal(result.ok, false);
  assert.equal(result.status, 401);
  assert.equal(result.code, 'USER_NOT_REGISTERED');
});

test('cognitoLogin: links Cognito sub and creates session for active user', async () => {
  let updatedSub = '';
  const mockUser = {
    id: 'u-123',
    cognito_sub: 'local:old-uuid',
    email: 'pharmacist1.ha@example.org',
    display_name: 'สมหญิง มั่นคง',
    role: 'PHARMACIST',
    hospital_id: 'h-1',
    hospital_code: 'HA',
    hospital_name: 'โรงพยาบาลสมุทรปราการ',
    region_id: 'r-1',
    mfa_enabled: false,
    active: true,
    additional_roles: [],
  };

  const mockRepo = {
    findUserByCognitoSub: async () => null,
    findUserByEmail: async () => ({ ...mockUser }),
    updateCognitoSub: async (_userId: string, sub: string) => {
      updatedSub = sub;
    },
    recordLoginEvent: async () => 1,
    updateUserLastLogin: async () => {},
  };

  const service = new AuthService(mockRepo as any);
  const result = await service.cognitoLogin({ sub: 'real-cognito-sub-789', email: 'pharmacist1.ha@example.org' });
  assert.equal(result.ok, true);
  assert.equal(result.status, 200);
  assert.equal(updatedSub, 'real-cognito-sub-789');
  assert.ok(result.token?.startsWith('sess_cog_'));
  assert.equal(result.user?.email, 'pharmacist1.ha@example.org');
});
