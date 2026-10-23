import { defaultToolRegistry } from './registry.js';
import { pingSystemTool, sampleActionProposalTool } from './sample.tools.js';

export * from './tool.types.js';
export * from './registry.js';
export * from './sample.tools.js';

// Auto-register built-in sample tools
defaultToolRegistry.registerOrReplace(pingSystemTool);
defaultToolRegistry.registerOrReplace(sampleActionProposalTool);
