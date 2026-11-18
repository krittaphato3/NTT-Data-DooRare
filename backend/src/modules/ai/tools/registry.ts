import { z } from 'zod';
import type { IAgentTool, RequestContext, ToolJsonSchema, ToolResult } from './tool.types.js';
import type { ToolDefinition } from '../providers/types.js';

/**
 * Converts a Zod Schema object into an OpenAI/JSON-Schema compatible parameter definition.
 */
export function zodToJsonSchema(schema: z.ZodObject<any>): ToolJsonSchema['parameters'] {
  // Zod 4 can describe nested arrays/objects (items[].drugMasterId …). The hand-rolled walker below only saw top-level
  // keys, so the model kept inventing payload shapes and the tools rejected them.
  try {
    const generated = z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' }) as Record<string, unknown>;
    delete generated.$schema;
    if (generated.type === 'object' && generated.properties) {
      return generated as unknown as ToolJsonSchema['parameters'];
    }
  } catch {
    // fall through to the legacy walker below
  }

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

    // Unpack optional/nullable/default/effects/preprocess if wrapped
    let inner: any = zodType;
    while (
      inner instanceof z.ZodOptional ||
      inner instanceof z.ZodNullable ||
      inner instanceof z.ZodDefault ||
      inner._def?.innerType ||
      inner._def?.schema ||
      inner._def?.out
    ) {
      if (inner._def?.innerType) {
        inner = inner._def.innerType;
      } else if (inner._def?.schema) {
        inner = inner._def.schema;
      } else if (inner._def?.out) {
        inner = inner._def.out;
      } else {
        break;
      }
    }

    description = zodType.description || inner.description;

    if (inner instanceof z.ZodNumber || inner._def?.type === 'number') {
      typeStr = 'number';
    } else if (inner instanceof z.ZodBoolean || inner._def?.type === 'boolean') {
      typeStr = 'boolean';
    } else if (inner instanceof z.ZodArray || inner._def?.type === 'array') {
      typeStr = 'array';
    } else if (
      inner instanceof z.ZodObject ||
      inner instanceof z.ZodRecord ||
      inner._def?.type === 'object' ||
      inner._def?.type === 'record'
    ) {
      typeStr = 'object';
    }

    const enumValues: string[] | undefined =
      inner instanceof z.ZodEnum ? [...(inner.options as string[])] : undefined;

    properties[key] = {
      type: typeStr,
      ...(enumValues ? { enum: enumValues } : {}),
      ...(description ? { description } : {}),
    };
  }

  return {
    type: 'object',
    properties,
    ...(required.length > 0 ? { required } : {}),
  };
}

/** JSON schema per tool, computed once (the coercion below only needs types, not validation). */
const jsonSchemaCache = new WeakMap<object, any>();

function jsonSchemaFor(tool: IAgentTool<any>): any {
  let cached = jsonSchemaCache.get(tool);
  if (!cached) {
    cached = zodToJsonSchema(tool.parameters);
    jsonSchemaCache.set(tool, cached);
  }
  return cached;
}

/**
 * Repairs the shapes models actually send ("20" for a number, null for an optional field) before strict validation.
 * The schema stays the single source of truth: unknown keys are still rejected, nothing is invented, and a value that
 * cannot be read as the declared type is left untouched so validation reports it (and the operator is asked).
 */
function coerceArgsToSchema(value: unknown, schema: any): unknown {
  if (!schema || typeof schema !== 'object') return value;

  if (Array.isArray(value) && schema.items) {
    return value.map((entry) => coerceArgsToSchema(entry, schema.items));
  }

  if (value && typeof value === 'object' && schema.properties) {
    const record = { ...(value as Record<string, unknown>) };
    for (const [key, propSchema] of Object.entries(schema.properties as Record<string, any>)) {
      if (!(key in record)) continue;
      record[key] = coerceArgsToSchema(record[key], propSchema);
    }
    return record;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if ((schema.type === 'number' || schema.type === 'integer') && trimmed !== '' && !Number.isNaN(Number(trimmed))) {
      return Number(trimmed);
    }
    if (schema.type === 'boolean' && (trimmed === 'true' || trimmed === 'false')) {
      return trimmed === 'true';
    }
  }

  return value;
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
      let argsToParse = typeof argsRaw === 'string' ? JSON.parse(argsRaw) : argsRaw || {};
      if (argsToParse && typeof argsToParse === 'object' && !Array.isArray(argsToParse)) {
        for (const [k, v] of Object.entries(argsToParse)) {
          if (typeof v === 'string') {
            const trimmed = v.trim();
            if (
              (trimmed === '' || trimmed === '00000000-0000-0000-0000-000000000000' || trimmed === 'null' || trimmed === 'undefined') &&
              (k === 'targetId' || k === 'taskId' || k.toLowerCase().endsWith('id'))
            ) {
              delete (argsToParse as Record<string, unknown>)[k];
              continue;
            }
            if (
              (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
              (trimmed.startsWith('[') && trimmed.endsWith(']'))
            ) {
              try {
                (argsToParse as Record<string, unknown>)[k] = JSON.parse(trimmed);
              } catch {
                // leave as string
              }
            }
          }
        }
      }
      argsToParse = coerceArgsToSchema(argsToParse, jsonSchemaFor(tool));
      const parsed = tool.parameters.safeParse(argsToParse);
      if (!parsed.success) {
        // Name the offending fields so the model can ask for exactly those instead of guessing again.
        const issues = parsed.error.issues
          .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
          .join('; ');
        return {
          success: false,
          error: `Invalid tool arguments for '${toolName}': ${issues}. Ask the operator for these values with ask_operator instead of retrying.`,
          validationErrors: parsed.error.issues.map((issue) => ({
            path: issue.path.join('.') || '(root)',
            message: issue.message,
          })),
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
