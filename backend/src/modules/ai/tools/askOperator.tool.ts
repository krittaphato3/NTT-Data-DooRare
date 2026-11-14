import { z } from 'zod';
import type { IAgentTool, ToolResult } from './tool.types.js';

/**
 * Tool: ask_operator
 * The escape hatch for every other tool. Instead of guessing a required value (or retrying a call that the schema just
 * rejected) the model asks the operator a short question, rendered as a panel with clickable choices and a free-text
 * answer. The turn ends there; the answer comes back as the next message, and the model continues with real values.
 */
export const askOperatorTool: IAgentTool<{
  questions: {
    header: string;
    question: string;
    options?: { label: string; description?: string }[];
    allowFreeText?: boolean;
    multiSelect?: boolean;
  }[];
}> = {
  name: 'ask_operator',
  description: `Asks the operator a short question and stops the turn. The UI renders a panel with clickable choices plus a custom answer field.
Use it when a tool rejected your arguments (missing or invalid required fields), or when you need one fact the database cannot give you. Never guess a value the schema rejected, and never retry the same failing call twice.
Shape: {"questions":[{"header":"จำนวนที่ต้องการ","question":"ต้องการยืมยากี่หน่วย?","options":[{"label":"10","description":"พอใช้ 3 วัน"},{"label":"20","description":"พอใช้ 1 สัปดาห์"}],"allowFreeText":true,"multiSelect":false}]}
Rules: 1–3 questions, at most 6 options each, each header under 24 characters. The operator can always type an answer. After calling this, stop — do not call more tools in the same turn.`,
  parameters: z.object({
    questions: z
      .array(
        z.object({
          header: z.string().min(1).max(24).describe('Short label for the question, e.g. จำนวนที่ต้องการ'),
          question: z.string().min(1).describe('The question itself, one sentence'),
          options: z
            .array(
              z.object({
                label: z.string().min(1).max(160).describe('A choice the operator can click'),
                description: z.string().max(240).optional().describe('One line explaining the choice'),
              }),
            )
            .max(6)
            .optional()
            .describe('Predicted answers; omit for fully open questions'),
          allowFreeText: z.boolean().optional().describe('Show the custom answer field (default true)'),
          multiSelect: z.boolean().optional().describe('Allow several choices at once (default false)'),
        }),
      )
      .min(1)
      .max(3)
      .describe('Questions to show in the panel'),
  }),
  allowedRoles: ['*'],
  execute: async (args): Promise<ToolResult> => {
    const questions = (args.questions ?? []).map((q) => ({
      header: q.header,
      question: q.question,
      options: (q.options ?? []).slice(0, 6).map((o) => ({ label: o.label, description: o.description })),
      allowFreeText: q.allowFreeText !== false,
      multiSelect: Boolean(q.multiSelect),
    }));

    if (questions.length === 0) {
      return { success: false, error: 'ask_operator needs at least one question.' };
    }

    return {
      success: true,
      data: { asked: questions.length },
      question: { questions },
    };
  },
};
