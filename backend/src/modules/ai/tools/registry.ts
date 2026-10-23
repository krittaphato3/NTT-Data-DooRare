import { z } from 'zod';
import type { IAgentTool, RequestContext, ToolJsonSchema, ToolResult } from './tool.types.js';
import type { ToolDefinition } from '../providers/types.js';

/**
 * Converts a Zod Schema object into an OpenAI/JSON-Schema compatible parameter definition.
 */
export function zodToJsonSchema(schema: z.ZodObject<any>): ToolJsonSchema['parameters'] {
  const shape = schema.shape;
  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  for (const [key, value] of Object.entries(shape)) {
    const zodType = value as z.ZodTypeAny;
    const isOptional = zodType.isOptional();
    if (!isOptional) {
      required.push(key);
    }

    let typeStr = 'string';
    let description: string | undefined;

    // Unpack optional/nullable/default if wrapped
    let inner: any = zodType;
    while (
      inner instanceof z.ZodOptional ||
      inner instanceof z.ZodNullable ||
      inner instanceof z.ZodDefault
    ) {
      inner = inner._def.innerType;
    }

    description = zodType.description || inner.description;

    if (inner instanceof z.ZodNumber) {
      typeStr = 'number';
    } else if (inner instanceof z.ZodBoolean) {
      typeStr = 'boolean';
    } else if (inner instanceof z.ZodArray) {
      typeStr = 'array';
    } else if (inner instanceof z.ZodObject) {
      typeStr = 'object';
    }

    properties[key] = {
      type: typeStr,
      ...(description ? { description } : {}),
    };
  }

  return {
    type: 'object',
    properties,
    ...(required.length > 0 ? { required } : {}),
  };
}

/**
 * Central Tool Registry where all domain tools (Person 3, Person 4, Person 5) are registered.
 */
export class ToolRegistry {
  private tools = new Map<string, IAgentTool<any>>();

  /**
   * Register a new agent tool. Throws if a tool with identical name already exists.
   */
  register(tool: IAgentTool<any>): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Agent tool with name '${tool.name}' is already registered.`);
    }
    this.tools.set(tool.name, tool);
  }

  /**
   * Register or overwrite a tool (useful in tests or hot reloading).
   */
  registerOrReplace(tool: IAgentTool<any>): void {
    this.tools.set(tool.name, tool);
  }

  /**
   * Get a registered tool by its unique name.
   */
  get(name: string): IAgentTool<any> | undefined {
    return this.tools.get(name);
  }

  /**
   * List all registered tools.
   */
  getAll(): IAgentTool<any>[] {
    return Array.from(this.tools.values());
  }

  /**
   * Return tools authorized for a specific user role.
   * If role is SYSTEM_ADMIN, returns all registered tools.
   */
  getToolsForRole(role?: string): IAgentTool<any>[] {
    if (!role) return [];
    if (role === 'SYSTEM_ADMIN') {
      return this.getAll();
    }
    return this.getAll().filter((tool) =>
      tool.allowedRoles.includes('*') || tool.allowedRoles.includes(role),
    );
  }

  /**
   * Formats tools into OpenAI/LLM ToolDefinition format for a given role.
   */
  getToolDefinitionsForRole(role?: string): ToolDefinition[] {
    const tools = this.getToolsForRole(role);
    return tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: zodToJsonSchema(tool.parameters),
    }));
  }

  /**
   * Executes a tool with argument validation and role authorization check.
   */
  async executeTool(
    toolName: string,
    argsRaw: unknown,
    context: RequestContext,
  ): Promise<ToolResult> {
    const tool = this.tools.get(toolName);
    if (!tool) {
      return {
        success: false,
        error: `Tool '${toolName}' not found in registry.`,
      };
    }

    // Role check
    const role = context.role;
    if (role !== 'SYSTEM_ADMIN' && !tool.allowedRoles.includes('*') && (!role || !tool.allowedRoles.includes(role))) {
      return {
        success: false,
        error: `Permission denied: Role '${role || 'ANONYMOUS'}' is not authorized to execute tool '${toolName}'.`,
      };
    }

    // Parse and validate arguments against Zod schema
    let parsedArgs: unknown;
    try {
      const argsToParse = typeof argsRaw === 'string' ? JSON.parse(argsRaw) : argsRaw || {};
      const parsed = tool.parameters.safeParse(argsToParse);
      if (!parsed.success) {
        return {
          success: false,
          error: `Invalid tool arguments for '${toolName}': ${parsed.error.message}`,
        };
      }
      parsedArgs = parsed.data;
    } catch (e: any) {
      return {
        success: false,
        error: `Failed to parse arguments for tool '${toolName}': ${e.message}`,
      };
    }

    // Execute tool
    try {
      return await tool.execute(parsedArgs, context);
    } catch (e: any) {
      return {
        success: false,
        error: `Execution error in tool '${toolName}': ${e.message}`,
      };
    }
  }

  /**
   * Resets registry (primarily for tests).
   */
  clear(): void {
    this.tools.clear();
  }
}

// Global Singleton Registry
export const defaultToolRegistry = new ToolRegistry();
