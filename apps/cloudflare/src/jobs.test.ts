import { describe, expect, it, vi } from "vitest";

import {
  consumeJobQueue,
  validateJobEnvelope,
  type CloudflareJobEnvelope,
  type JobFailureRecord,
  type QueueBatchLike,
} from "./jobs";
import type { CloudflareBindings } from "./types";

const env = {
  APP_ENV: "test",
} satisfies CloudflareBindings;

const createdAt = "2026-06-21T07:00:00.000Z";

const validEnvelopes: CloudflareJobEnvelope[] = [
  {
    id: "job-upload-audit-1",
    schemaVersion: 1,
    type: "upload-audit",
    createdAt,
    payload: {
      objectKey: "workspaces/demo/logo.png",
      sourceBucket: "plane-uploads",
      targetBucket: "manut-uploads-preview",
      status: "verified",
    },
  },
  {
    id: "job-migration-audit-1",
    schemaVersion: 1,
    type: "migration-audit",
    createdAt,
    payload: {
      source: "postgres.project",
      target: "d1.project",
      status: "matched",
      sourceCount: 42,
      targetCount: 42,
    },
  },
  {
    id: "job-email-dispatch-1",
    schemaVersion: 1,
    type: "email-dispatch",
    createdAt,
    payload: {
      to: "operator@manut.xyz",
      template: "migration-audit-failed",
      idempotencyKey: "migration-audit-failed:job-email-dispatch-1",
      data: {
        phase: "queues-cron-cache-live",
      },
    },
  },
  {
    id: "job-import-export-1",
    schemaVersion: 1,
    type: "import-export",
    createdAt,
    payload: {
      workspaceId: "workspace-1",
      operation: "export",
      format: "zip",
      requestedBy: "operator",
    },
  },
];

describe("Cloudflare Queue job primitives", () => {
  it("accepts typed envelopes for the supported foundation job categories", () => {
    for (const envelope of validEnvelopes) {
      const result = validateJobEnvelope(envelope);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.envelope).toEqual(envelope);
      }
    }
  });

  it("rejects malformed supported job envelopes with explicit validation errors", () => {
    const result = validateJobEnvelope({
      id: "job-email-dispatch-invalid",
      schemaVersion: 1,
      type: "email-dispatch",
      createdAt,
      payload: {
        template: "missing-recipient",
        idempotencyKey: "missing-recipient:1",
      },
    });

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "INVALID_JOB_PAYLOAD",
        field: "payload.to",
      },
    });
  });

  it("records unsupported queue jobs as explicit failures", async () => {
    const ack = vi.fn();
    const retry = vi.fn();
    const recordedFailures: JobFailureRecord[] = [];
    const batch: QueueBatchLike = {
      queue: "manut-jobs-test",
      messages: [
        {
          id: "message-unsupported-1",
          body: {
            id: "job-unsupported-1",
            schemaVersion: 1,
            type: "thumbnail-render",
            createdAt,
            payload: {},
          },
          ack,
          retry,
        },
      ],
    };

    const summary = await consumeJobQueue(batch, env, {
      recordFailure: (failure) => {
        recordedFailures.push(failure);
      },
    });

    expect(summary).toMatchObject({
      queueName: "manut-jobs-test",
      accepted: 0,
      failed: 1,
    });
    expect(summary.failures).toHaveLength(1);
    expect(summary.failures[0]).toMatchObject({
      status: "failed",
      queueName: "manut-jobs-test",
      messageId: "message-unsupported-1",
      jobId: "job-unsupported-1",
      jobType: "thumbnail-render",
      reason: "UNSUPPORTED_JOB_TYPE",
      retryable: false,
    });
    expect(recordedFailures).toEqual(summary.failures);
    expect(ack).toHaveBeenCalledTimes(1);
    expect(retry).not.toHaveBeenCalled();
  });
});
