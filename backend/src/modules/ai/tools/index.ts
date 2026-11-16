import { defaultToolRegistry } from './registry.js';
import { pingSystemTool, sampleActionProposalTool } from './sample.tools.js';
import { askOperatorTool } from './askOperator.tool.js';

export * from './tool.types.js';
export * from './registry.js';
export * from './sample.tools.js';
export * from './askOperator.tool.js';
export * from './clinical/index.js';
export * from './logistics/index.js';
export * from './governance/index.js';
export * from './web/web.tools.js';

import { clinicalTools } from './clinical/index.js';
import { logisticsTools } from './logistics/index.js';
import { governanceTools } from './governance/index.js';
import { webTools } from './web/web.tools.js';

// Auto-register built-in sample tools
defaultToolRegistry.registerOrReplace(pingSystemTool);
defaultToolRegistry.registerOrReplace(sampleActionProposalTool);
// Clarification tool: available to every role, ends the turn with a choices + free-text panel
defaultToolRegistry.registerOrReplace(askOperatorTool);

// Auto-register Person 3 Clinical & Emergency tools (12 tools)
for (const tool of clinicalTools) {
  defaultToolRegistry.registerOrReplace(tool);
}

// Auto-register Person 4 Logistics & Operations tools (15 tools)
for (const tool of logisticsTools) {
  defaultToolRegistry.registerOrReplace(tool);
}

// Auto-register Person 5 Governance, Compliance & QA Lead tools (22 tools)
for (const tool of governanceTools) {
  defaultToolRegistry.registerOrReplace(tool);
}

// Auto-register read-only web tools (2 tools): web_fetch + keyless web_search
for (const tool of webTools) {
  defaultToolRegistry.registerOrReplace(tool);
}
