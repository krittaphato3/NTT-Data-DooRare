import { defaultToolRegistry } from './registry.js';
import { pingSystemTool, sampleActionProposalTool } from './sample.tools.js';

export * from './tool.types.js';
export * from './registry.js';
export * from './sample.tools.js';
export * from './clinical/index.js';
export * from './logistics/index.js';

import { clinicalTools } from './clinical/index.js';
import { logisticsTools } from './logistics/index.js';

// Auto-register built-in sample tools
defaultToolRegistry.registerOrReplace(pingSystemTool);
defaultToolRegistry.registerOrReplace(sampleActionProposalTool);

// Auto-register Person 3 Clinical & Emergency tools (12 tools)
for (const tool of clinicalTools) {
  defaultToolRegistry.registerOrReplace(tool);
}

// Auto-register Person 4 Logistics & Operations tools (15 tools)
for (const tool of logisticsTools) {
  defaultToolRegistry.registerOrReplace(tool);
}
