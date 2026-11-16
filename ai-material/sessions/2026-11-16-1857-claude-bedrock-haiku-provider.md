---
title: Bedrock Haiku Provider
date: 2026-11-16
author: UNKNOWN
ai: CLAUDE
tags: session, byok, bedrock, haiku
summary: Real AWS_BEDROCK provider for Claude Haiku 5.5 (was a stub); EC2 frontend deploy steps; cost estimate.
---

## Goal

- Use Claude Haiku 5.5 (`anthropic.claude-haiku-5-5`) through Amazon Bedrock from the existing BYOK page; estimate cost.

## Done

- Replaced the stub `BedrockProvider` with a real call via `@anthropic-ai/bedrock-sdk` (`AnthropicBedrockMantle`): real `usage`, tool_use mapping, refusal -> error, Test Connection makes a real request.
- Auth: BYOK Access Key + Secret when both set, else default AWS chain (EC2 instance role).
- No `temperature` sent (Haiku 5.5 returns 400 on non-default), `output_config.effort: low`.
- New tests `backend/tests/ai.bedrock.test.ts` (4 pass, stub client, no network). `tsc --noEmit` OK.
- Cost (official Bedrock page): Haiku 5.5 $0.10 in / $0.50 out per 1M; ~$10/month at 14,400 calls of 3,000 in + 800 out (assumed sizes).
- Also: frontend deploy to S3 `doorare-frontend` + CloudFront invalidation (documented in chat, not in repo).

## Decisions

- Bedrock chosen over direct Anthropic API (user decision). Dependency `@anthropic-ai/bedrock-sdk` approved by user.
- AWS Pricing Calculator unusable for Haiku 5.5 (output locked to Mythos, shows $50/1M): use the AWS pricing page instead.
- Auth target: EC2 IAM role (admin must attach; `ChallengerAccess` cannot create instance profiles).

## Files touched

- `backend/src/modules/ai/providers/bedrock.provider.ts`
- `backend/tests/ai.bedrock.test.ts` (new)
- `backend/package.json`, `backend/package-lock.json` (large lock churn from install)

## Errors

- 88 existing tests fail locally only because Postgres is not running (`ECONNREFUSED 127.0.0.1:5442`); unrelated.
- Used `git stash` for a baseline run; it was restored (verified) but avoid it on a shared working tree.

## Next steps

- Admin attaches an IAM role to the EC2 instance with `bedrock-mantle:CreateInference` (the Mantle endpoint action per Anthropic docs; NOT `bedrock:InvokeModel`, which is the separate bedrock-runtime endpoint). ARN format not documented there: start with Resource `*`, then tighten. Docs do not name EC2 instance profile as an auth path (SDK default chain should cover it; verify with Test Connection). Haiku 5.5 access is "see console", not open by default.
- In BYOK select Amazon Bedrock, model `anthropic.claude-haiku-5-5` (or the inference profile ID if required), region where it is enabled.
- Deploy backend to EC2 (`docker compose up --build -d --no-deps backend`), run Test Connection, then a few agent runs; compare `agent_run.tokens_in/out` and Cost Explorer with the estimate.
- `byok.service.ts` default model IDs still point at Claude 3.5 (left unchanged).
- Check data residency if a cross-region inference profile is used.

## Update (Nova Lite fallback)

- Account lacks Haiku 5.5 access (`not available for this account`, not IAM). Chose Amazon Nova Lite (`amazon.nova-lite-v1:0`) via Converse.
- `bedrock.provider.ts`: `usesMantle(model)` routes Claude 5.x to Mantle, all else to `@aws-sdk/client-bedrock-runtime` Converse (default model now Nova Lite). Session token passed when BYOK key == env key.
- Dependency added: `@aws-sdk/client-bedrock-runtime` (was already transitive). 8 tests pass.
- Next: deploy, BYOK = Amazon Bedrock, model `amazon.nova-lite-v1:0`, region us-east-1, Test Connection. Not verified against real AWS.
