import { hospitalAdminTools } from './hospitalAdmin.tools.js';
import { regionAdminTools } from './regionAdmin.tools.js';
import { systemAdminTools } from './systemAdmin.tools.js';
import { dataAdminTools } from './dataAdmin.tools.js';
import { auditorTools } from './auditor.tools.js';

export * from './hospitalAdmin.tools.js';
export * from './regionAdmin.tools.js';
export * from './systemAdmin.tools.js';
export * from './dataAdmin.tools.js';
export * from './auditor.tools.js';

/**
 * Person 5: Governance, Compliance & QA Lead Tools (22 tools)
 * - 4 Hospital Admin tools
 * - 5 Region Admin tools
 * - 5 System Admin tools
 * - 4 Data Admin tools
 * - 4 Auditor tools
 */
export const governanceTools = [
  ...hospitalAdminTools,
  ...regionAdminTools,
  ...systemAdminTools,
  ...dataAdminTools,
  ...auditorTools,
] as const;
