#!/usr/bin/env node
// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
// See the LICENSE file for details.

import fs from "node:fs";
import path from "node:path";

export const DEFAULT_WORKERS_AI_MODEL = "@cf/zai-org/glm-5.2";
export const DEFAULT_WORKERS_AI_PROMPT =
  "Reply with a short sentence confirming Cloudflare Workers AI is reachable for Manut.";

function usage() {
  return `Usage: node apps/cloudflare/tools/workers-ai-smoke.mjs [--json] [--out <report.json>]

Environment:
  CLOUDFLARE_ACCOUNT_ID  Cloudflare account id
  CLOUDFLARE_API_TOKEN   Cloudflare API token with Workers AI access

Options:
  --model <model>        Workers AI model id. Default: ${DEFAULT_WORKERS_AI_MODEL}
  --prompt <prompt>      User prompt for the live smoke request
  --expected <text>      Optional text that must appear in the model response
  --json                Print JSON report instead of human summary
  --out <report.json>   Write report JSON to a file
`;
}

function parseArgs(argv) {
  const options = {
    json: false,
    outPath: null,
    model: DEFAULT_WORKERS_AI_MODEL,
    prompt: DEFAULT_WORKERS_AI_PROMPT,
    expected: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--json") {
      options.json = true;
    } else if (arg === "--out") {
      options.outPath = argv[++index];
      if (!options.outPath) throw new Error("--out requires a path");
    } else if (arg === "--model") {
      options.model = argv[++index];
      if (!options.model) throw new Error("--model requires a model id");
    } else if (arg === "--prompt") {
      options.prompt = argv[++index];
      if (!options.prompt) throw new Error("--prompt requires text");
    } else if (arg === "--expected") {
      options.expected = argv[++index];
      if (!options.expected) throw new Error("--expected requires text");
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function responseTextFromResult(result) {
  const choices = Array.isArray(result?.choices) ? result.choices : [];
  const choiceContent = choices[0]?.message?.content;
  if (typeof choiceContent === "string" && choiceContent.trim()) {
    return choiceContent.trim();
  }

  if (typeof result?.response === "string" && result.response.trim()) {
    return result.response.trim();
  }

  return "";
}

export async function buildWorkersAISmokeReport({
  accountId = process.env.CLOUDFLARE_ACCOUNT_ID,
  apiToken = process.env.CLOUDFLARE_API_TOKEN,
  model = DEFAULT_WORKERS_AI_MODEL,
  prompt = DEFAULT_WORKERS_AI_PROMPT,
  expected = null,
  fetchImpl = globalThis.fetch,
  now = () => new Date(),
} = {}) {
  const timestamp = now().toISOString();
  const checks = [];
  const credentialsOk = Boolean(accountId?.trim() && apiToken?.trim());
  checks.push({
    id: "credentials",
    ok: credentialsOk,
    evidence: credentialsOk
      ? "CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN are present."
      : "Missing CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_API_TOKEN.",
  });

  const report = {
    type: "cloudflare-workers-ai-smoke",
    timestamp,
    model,
    ok: false,
    checks,
  };

  if (!credentialsOk) {
    return report;
  }

  const startedAt = Date.now();
  try {
    const response = await fetchImpl(
      `https://api.cloudflare.com/client/v4/accounts/${accountId.trim()}/ai/run/${model}`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiToken.trim()}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          messages: [
            {
              role: "system",
              content: "You are validating a production smoke check. Respond concisely.",
            },
            { role: "user", content: prompt },
          ],
        }),
        signal: AbortSignal.timeout(30_000),
      }
    );

    const body = await response.json().catch(() => ({}));
    const text = responseTextFromResult(body.result);
    const expectedOk = expected ? text.toLowerCase().includes(expected.toLowerCase()) : Boolean(text);
    checks.push({
      id: "workers-ai-run",
      ok: response.ok && expectedOk,
      status: response.status,
      duration_ms: Date.now() - startedAt,
      response_excerpt: text.slice(0, 500),
      evidence: response.ok
        ? "Workers AI request returned a response."
        : `Workers AI request returned HTTP ${response.status}.`,
    });
  } catch (error) {
    checks.push({
      id: "workers-ai-run",
      ok: false,
      duration_ms: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  report.ok = checks.every((check) => check.ok);
  return report;
}

function printHuman(report) {
  console.log(`Cloudflare Workers AI smoke: ${report.ok ? "PASS" : "FAIL"}`);
  console.log(`Model: ${report.model}`);
  for (const check of report.checks) {
    console.log(`- ${check.id}: ${check.ok ? "PASS" : "FAIL"}`);
    if (check.evidence) console.log(`  ${check.evidence}`);
    if (check.status) console.log(`  status=${check.status}`);
    if (check.response_excerpt) console.log(`  response=${check.response_excerpt}`);
    if (check.error) console.log(`  error=${check.error}`);
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const report = await buildWorkersAISmokeReport(options);

  if (options.outPath) {
    fs.mkdirSync(path.dirname(path.resolve(options.outPath)), { recursive: true });
    fs.writeFileSync(options.outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  }

  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printHuman(report);
  }

  process.exitCode = report.ok ? 0 : 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(`Workers AI smoke failed: ${error.message}`);
    console.error(usage());
    process.exitCode = 2;
  });
}
