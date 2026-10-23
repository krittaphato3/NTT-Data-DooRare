import { z } from 'zod';
import type { IAgentTool, RequestContext, ToolResult } from './tool.types.js';

/**
 * Built-in Sample Tool: Ping and system status inspection.
 * Allows quick sanity checks without accessing database tables.
 */
export const pingSystemTool: IAgentTool<{ echo?: string }> = {
  name: 'ping_system',
  description: 'Pings the DooRare AI system to verify tool-calling execution and latency.',
  parameters: z.object({
    echo: z.string().optional().describe('Optional echo message string'),
  }),
  allowedRoles: ['*'], // Available to all roles
  execute: async (args: { echo?: string }, context: RequestContext): Promise<ToolResult> => {
    return {
      success: true,
      data: {
        pong: true,
        echo: args.echo || 'OK',
        serverTime: new Date().toISOString(),
        callerRole: context.role || 'ANONYMOUS',
        hospitalId: context.hospitalId || null,
      },
    };
  },
};

/**
 * Sample Proposal Tool: Mock Proposal creation.
 * Demonstrates how Terminal Proposal Tools return interactive action cards.
 */
export const sampleActionProposalTool: IAgentTool<{
  proposalTitle: string;
  targetHospital: string;
  quantity: number;
}> = {
  name: 'submit_sample_action_proposal',
  description: 'Submits a sample clinical or logistics proposal for human authorization.',
  parameters: z.object({
    proposalTitle: z.string().describe('Title of the proposed action'),
    targetHospital: z.string().describe('Name or code of the target hospital'),
    quantity: z.number().int().positive().describe('Quantity of items to transfer or borrow'),
  }),
  allowedRoles: ['PHARMACIST', 'ER_STAFF', 'SYSTEM_ADMIN'],
  execute: async (args, context): Promise<ToolResult> => {
    return {
      success: true,
      proposal: {
        type: 'SAMPLE_ACTION_PROPOSAL',
        title: args.proposalTitle,
        description: `Proposed transfer of ${args.quantity} units involving ${args.targetHospital}`,
        summary: {
          hospital: args.targetHospital,
          quantity: args.quantity,
          requestedBy: context.userId || 'current-user',
        },
        actionApi: {
          endpoint: '/api/v1/ai/proposals/execute-sample',
          method: 'POST',
          payload: {
            title: args.proposalTitle,
            targetHospital: args.targetHospital,
            quantity: args.quantity,
          },
        },
      },
    };
  },
};
