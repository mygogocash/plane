/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { chmod, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

import { describe, expect, it } from "vitest";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(currentDir, "..", "..", "..");
const syncScript = path.join(repoRoot, ".github", "ops", "betterstack", "sync-manut-monitors.sh");

function runSyncScript(env: NodeJS.ProcessEnv) {
  return new Promise<{ stdout: string; stderr: string; code: number | null }>((resolve) => {
    const child = spawn("bash", [syncScript], {
      cwd: repoRoot,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("close", (code) => {
      resolve({ stdout, stderr, code });
    });
  });
}

describe("Better Stack monitor sync script", () => {
  it("updates monitors found on paginated list responses instead of creating duplicates", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "betterstack-sync-"));
    const callsPath = path.join(tempDir, "curl-calls.jsonl");
    const curlPath = path.join(tempDir, "curl");
    const fakeCurl = `#!/usr/bin/env node
const fs = require("node:fs");
const args = process.argv.slice(2);
const outPath = args[args.indexOf("-o") + 1];
const method = args[args.indexOf("-X") + 1] || "GET";
const dataIndex = args.indexOf("--data");
const data = dataIndex >= 0 ? JSON.parse(args[dataIndex + 1]) : null;
const url = args.find((arg) => /^https?:\\/\\//.test(arg));
fs.appendFileSync(process.env.CURL_CALLS, JSON.stringify({ method, url, data }) + "\\n");

const monitors = {
  app: {
    id: "monitor-app",
    type: "monitor",
    attributes: {
      pronounceable_name: "app.manut.xyz",
      url: "https://app.manut.xyz",
      status: "up"
    }
  },
  site: {
    id: "monitor-site",
    type: "monitor",
    attributes: {
      pronounceable_name: "manut.xyz",
      url: "https://manut.xyz",
      status: "up"
    }
  },
  api: {
    id: "monitor-api",
    type: "monitor",
    attributes: {
      pronounceable_name: "app.manut.xyz API instances",
      url: "https://app.manut.xyz/api/instances/",
      status: "up"
    }
  }
};

let body = { data: { id: "ok" } };
if (method === "GET" && url.endsWith("/monitors")) {
  body = {
    data: [monitors.app, monitors.site],
    pagination: {
      next: "https://uptime.betterstack.com/api/v2/monitors?page=2"
    }
  };
} else if (method === "GET" && url.endsWith("/monitors?page=2")) {
  body = {
    data: [monitors.api],
    pagination: {
      next: null
    }
  };
}

fs.writeFileSync(outPath, JSON.stringify(body));
process.stdout.write("200");
`;
    await writeFile(curlPath, fakeCurl, "utf8");
    await chmod(curlPath, 0o755);

    const result = await runSyncScript({
      ...process.env,
      PATH: `${tempDir}:${process.env.PATH}`,
      BETTERSTACK_API_TOKEN: "token",
      CURL_CALLS: callsPath,
    });

    expect(result.code, `${result.stdout}\n${result.stderr}`).toBe(0);
    const calls = (await readFile(callsPath, "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));

    expect(calls.filter((call) => call.method === "GET").map((call) => call.url)).toEqual([
      "https://uptime.betterstack.com/api/v2/monitors",
      "https://uptime.betterstack.com/api/v2/monitors?page=2",
    ]);
    expect(calls.filter((call) => call.method === "POST")).toEqual([]);
    expect(calls.filter((call) => call.method === "PATCH").map((call) => call.url)).toEqual([
      "https://uptime.betterstack.com/api/v2/monitors/monitor-app",
      "https://uptime.betterstack.com/api/v2/monitors/monitor-site",
      "https://uptime.betterstack.com/api/v2/monitors/monitor-api",
    ]);
  });
});
