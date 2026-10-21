/** Maps `GET /hospitals?stats=true` onto the HospitalSummary rows of the admin hospitals tab (and back for create / update). */
import type { ApiHospital, ApiHospitalStats } from '../../../services/catalogApi';
import type { HospitalSummary } from './adminData';

const TYPE: Record<string, HospitalSummary['type']> = { TERTIARY: 'รพศ.', SECONDARY: 'รพท.' };
const TIER: Record<HospitalSummary['type'], string> = { 'รพศ.': 'TERTIARY', 'รพท.': 'SECONDARY', 'รพช.': 'COMMUNITY' };
const ZERO: ApiHospitalStats = { requestCount: 0, incomingCount: 0, approvedCount: 0, rejectedCount: 0, timeoutCount: 0, dispatchedCount: 0, inTransitCount: 0, staffCount: 0 };

export function hospitalFromApi(h: ApiHospital & { stats?: ApiHospitalStats }): HospitalSummary {
  return {
    id: h.id,
    version: h.version,
    code: h.code,
    name: h.nameTh,
    shortName: h.nameTh.replace('โรงพยาบาล', 'รพ.'),
    province: h.province ?? '–',
    type: TYPE[h.tier ?? ''] ?? 'รพช.',
    bedCount: h.bedCount ?? 0,
    hasColdChain: h.hasColdChain,
    hasBloodBank: h.hasBloodBank,
    agentParticipation: h.agentParticipation,
    ...(h.stats ?? ZERO),
    detailedLogs: [],
  };
}

/** Body for POST / PATCH /hospitals from the (partial) form values. */
export function hospitalToApi(u: Partial<HospitalSummary>): Record<string, unknown> {
  return {
    ...(u.code !== undefined ? { code: u.code } : {}),
    ...(u.name !== undefined ? { nameTh: u.name } : {}),
    ...(u.province !== undefined ? { province: u.province } : {}),
    ...(u.type !== undefined ? { tier: TIER[u.type] } : {}),
    ...(u.bedCount !== undefined ? { bedCount: u.bedCount } : {}),
    ...(u.hasColdChain !== undefined ? { hasColdChain: u.hasColdChain } : {}),
    ...(u.hasBloodBank !== undefined ? { hasBloodBank: u.hasBloodBank } : {}),
    ...(u.agentParticipation !== undefined ? { agentParticipation: u.agentParticipation } : {}),
  };
}
