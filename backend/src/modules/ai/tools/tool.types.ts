import { z } from 'zod';
import type { ALL_ROLES } from '../../admin/users.rules.js';

export type UserRole = (typeof ALL_ROLES)[number];

export interface RequestContext {
  userId?: string;
  role?: string;
  hospitalId?: string | null;
  regionId?: string | null;
  correlationId?: string;
  [key: string]: unknown;
}

export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
  proposal?: ToolProposalPayload;
}

export interface ToolProposalPayload {
  type: string;
  title: string;
  description: string;
  summary: Record<string, unknown>;
  actionApi: {
    endpoint: string;
    method: 'POST' | 'PUT' | 'PATCH';
    payload: Record<string, unknown>;
  };
}

export interface IAgentTool<TArgs = unknown> {
  name: string;
  description: string;
  parameters: z.ZodObject<any>;
  allowedRoles: readonly (UserRole | string)[];
  execute: (args: TArgs, context: RequestContext) => Promise<ToolResult>;
}

export interface ToolJsonSchema {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}
