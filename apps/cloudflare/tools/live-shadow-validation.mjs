import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { resolveRepoPath } from "./path-utils.mjs";

function usage() {
  return `Usage: node apps/cloudflare/tools/live-shadow-validation.mjs <worker-base-url> [--room <room-name>] [--json] [--out <report.json>]

Runs Phase 7 live shadow validation against the Cloudflare Worker diagnostic
Durable Object route. This command is non-destructive and does not touch the
public /live/* route, which remains a legacy GKE proxy until cutover.

Exit codes:
  0  live shadow checks passed
  1  one or more live shadow checks failed
  2  usage error`;
}

function parseArgs(argv) {
  const options = {
    json: false,
    outPath: null,
    positional: [],
    room: "phase-07-shadow-room",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--") {
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }

    if (arg === "--json") {
      options.json = true;
      continue;
    }

    if (arg === "--out") {
      const outPath = argv[index + 1];
      if (!outPath) {
        throw new Error("--out requires a path");
      }
      options.outPath = outPath;
      index += 1;
      continue;
    }

    if (arg === "--room") {
      const room = argv[index + 1];
      if (!room) {
        throw new Error("--room requires a room name");
      }
      options.room = room;
      index += 1;
      continue;
    }

    if (arg.startsWith("--")) {
      throw new Error(`Unknown argument: ${arg}`);
    }

    options.positional.push(arg);
  }

  if (!options.help && options.positional.length !== 1) {
    throw new Error("Expected exactly one Worker base URL");
  }

  return {
    ...options,
    baseUrl: options.positional[0],
  };
}

function normalizeBaseUrl(rawUrl) {
  const url = new URL(rawUrl);
  url.pathname = url.pathname.replace(/\/+$/, "");
  url.search = "";
  url.hash = "";
  return url;
}

function roomPath(room, suffix) {
  return `/api/cloudflare/live/rooms/${encodeURIComponent(room)}${suffix}`;
}

function redactBodySample(body) {
  return body.slice(0, 200);
}

async function requestJson(baseUrl, room, check) {
  const url = new URL(roomPath(room, check.path), baseUrl);
  const startedAt = Date.now();

  try {
    const response = await fetch(url, {
      body: check.body ? JSON.stringify(check.body) : undefined,
      headers: check.body ? { "content-type": "application/json" } : undefined,
      method: check.method ?? "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(15000),
    });
    const body = await response.text();
    let json = null;
    if ((response.headers.get("content-type") ?? "").includes("application/json") && body) {
      try {
        json = JSON.parse(body);
      } catch {
        json = null;
      }
    }
    const assertions = [
      {
        ok: check.expectedStatuses.includes(response.status),
        name: "status",
        expected: check.expectedStatuses,
        actual: response.status,
      },
      {
        ok: Boolean(json && check.validateJson(json)),
        name: "json-contract",
      },
    ];

    return {
      id: check.id,
      ok: assertions.every((assertion) => assertion.ok),
      url: url.toString(),
      status: response.status,
      duration_ms: Date.now() - startedAt,
      content_type: response.headers.get("content-type"),
      cf_ray: response.headers.get("cf-ray"),
      assertions,
      body_sample: redactBodySample(body),
    };
  } catch (error) {
    return {
      id: check.id,
      ok: false,
      url: url.toString(),
      duration_ms: Date.now() - startedAt,
      error: error.message,
      assertions: [
        {
          ok: false,
          name: "request",
        },
      ],
    };
  }
}

function validateCapabilities(json) {
  return (
    json.capabilities?.health === true &&
    json.capabilities?.metadata === true &&
    json.capabilities?.locks === true &&
    json.capabilities?.websocket === true &&
    json.capabilities?.collaboration === true
  );
}

export function buildLockKey() {
  return `phase-07-shadow-${randomUUID()}`;
}

export function buildCapabilityChecks() {
  return [
    {
      id: "live-room-health",
      path: "/health",
      expectedStatuses: [200],
      validateJson: (json) =>
        json.ok === true &&
        json.service === "manut-live-room" &&
        json.storage === "durable-object" &&
        validateCapabilities(json),
    },
    {
      id: "live-room-metadata",
      path: "/metadata",
      expectedStatuses: [200],
      validateJson: (json) =>
        json.service === "manut-live-room" &&
        json.room?.storage === "durable-object" &&
        json.room?.collaboration === "shadow-websocket" &&
        validateCapabilities(json),
    },
    {
      id: "live-room-planned-response",
      path: "",
      expectedStatuses: [202],
      validateJson: (json) =>
        json.status === "planned" && json.service === "manut-live-room" && validateCapabilities(json),
    },
  ];
}

export function buildLockChecks(lockKey) {
  return [
    {
      id: "live-room-lock-acquire",
      path: `/locks/${encodeURIComponent(lockKey)}/acquire`,
      method: "POST",
      body: { holder: "phase-07-validator-a", ttl_seconds: 60 },
      expectedStatuses: [200],
      validateJson: (json) =>
        json.ok === true &&
        json.lock?.key === lockKey &&
        json.lock?.holder === "phase-07-validator-a" &&
        json.lock?.ttl_seconds === 60,
    },
    {
      id: "live-room-lock-conflict",
      path: `/locks/${encodeURIComponent(lockKey)}/acquire`,
      method: "POST",
      body: { holder: "phase-07-validator-b", ttl_seconds: 60 },
      expectedStatuses: [409],
      validateJson: (json) =>
        json.error === "LIVE_ROOM_LOCK_CONFLICT" &&
        json.lock?.key === lockKey &&
        json.lock?.holder === "phase-07-validator-a",
    },
    {
      id: "live-room-lock-release",
      path: `/locks/${encodeURIComponent(lockKey)}/release`,
      method: "POST",
      body: { holder: "phase-07-validator-a" },
      expectedStatuses: [200],
      validateJson: (json) => json.ok === true && json.lock?.key === lockKey && json.lock?.released === true,
    },
  ];
}

function buildWebSocketUrl(baseUrl, room) {
  const url = new URL(roomPath(room, "/socket"), baseUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url;
}

async function runWebSocketCheck(baseUrl, room) {
  const url = buildWebSocketUrl(baseUrl, room);
  const startedAt = Date.now();

  if (typeof WebSocket === "undefined") {
    return {
      id: "live-room-websocket-echo",
      ok: false,
      url: url.toString(),
      duration_ms: Date.now() - startedAt,
      error: "WebSocket is not available in this Node.js runtime.",
    };
  }

  const deferred = Promise.withResolvers();
  const socket = new WebSocket(url);
  const probe = JSON.stringify({
    id: `shadow-${Date.now()}`,
    type: "shadow.ping",
  });
  const messages = [];
  let settled = false;
  const finish = (result) => {
    if (settled) {
      return;
    }
    settled = true;
    clearTimeout(timeout);
    deferred.resolve(result);
  };
  const timeout = setTimeout(() => {
    try {
      socket.close();
    } catch {
      // Ignore close errors in timeout cleanup.
    }
    finish({
      id: "live-room-websocket-echo",
      ok: false,
      url: url.toString(),
      duration_ms: Date.now() - startedAt,
      messages,
      error: "Timed out waiting for WebSocket echo.",
    });
  }, 15000);

  socket.addEventListener("open", () => {
    socket.send(probe);
  });
  socket.addEventListener("message", (event) => {
    const raw = typeof event.data === "string" ? event.data : String(event.data);
    messages.push(raw.slice(0, 200));
    try {
      const json = JSON.parse(raw);
      if (json.type === "room.message" && json.service === "manut-live-room" && json.data === probe) {
        socket.close();
        finish({
          id: "live-room-websocket-echo",
          ok: true,
          url: url.toString(),
          duration_ms: Date.now() - startedAt,
          messages,
        });
      }
    } catch {
      // Keep waiting for a JSON room.message payload.
    }
  });
  socket.addEventListener("error", () => {
    finish({
      id: "live-room-websocket-echo",
      ok: false,
      url: url.toString(),
      duration_ms: Date.now() - startedAt,
      messages,
      error: "WebSocket connection failed.",
    });
  });

  return deferred.promise;
}

function printHuman(report) {
  console.log(`Live shadow validation: ${report.ok ? "PASS" : "FAIL"}`);
  console.log(`Base URL: ${report.base_url}`);
  console.log(`Room: ${report.room}`);
  console.log(`Checks passed: ${report.summary.passed}/${report.summary.total}`);

  for (const check of report.checks) {
    console.log(`- ${check.ok ? "PASS" : "FAIL"} ${check.id}: HTTP ${check.status ?? "n/a"}`);
  }
}

async function main() {
  let options;

  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`Live shadow validation failed: ${error.message}`);
    console.error("");
    console.error(usage());
    process.exitCode = 2;
    return;
  }

  if (options.help) {
    console.log(usage());
    return;
  }

  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const lockKey = buildLockKey();
  const capabilityChecks = await Promise.all(
    buildCapabilityChecks().map((check) => requestJson(baseUrl, options.room, check))
  );
  const lockChecks = [];
  for (const check of buildLockChecks(lockKey)) {
    // Lock acquire/conflict/release must run in order to validate Durable Object semantics.
    // eslint-disable-next-line no-await-in-loop
    lockChecks.push(await requestJson(baseUrl, options.room, check));
  }
  const webSocketCheck = await runWebSocketCheck(baseUrl, options.room);
  const checks = [...capabilityChecks, ...lockChecks, webSocketCheck];
  const failed = checks.filter((check) => !check.ok);
  const report = {
    generated_at: new Date().toISOString(),
    base_url: baseUrl.toString(),
    room: options.room,
    lock_key: lockKey,
    ok: failed.length === 0,
    summary: {
      total: checks.length,
      passed: checks.length - failed.length,
      failed: failed.length,
    },
    checks,
  };

  if (options.outPath) {
    const outPath = resolveRepoPath(options.outPath);
    await mkdir(path.dirname(outPath), { recursive: true });
    await writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  }

  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printHuman(report);
  }

  process.exitCode = report.ok ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`Live shadow validation failed: ${error.message}`);
    process.exitCode = 2;
  });
}
