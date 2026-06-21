import type { CloudflareBindings } from "./types";

export const supportedJobTypes = ["upload-audit", "migration-audit", "email-dispatch", "import-export"] as const;

export type CloudflareJobType = (typeof supportedJobTypes)[number];
export type JobSchemaVersion = 1;
export type UploadAuditStatus = "pending" | "verified" | "failed";
export type MigrationAuditStatus = "pending" | "matched" | "mismatched" | "failed";
export type ImportExportOperation = "import" | "export";
export type ImportExportFormat = "json" | "csv" | "zip";
export type JsonPrimitive = string | number | boolean | null;

type JobEnvelope<TType extends CloudflareJobType, TPayload> = {
  id: string;
  schemaVersion: JobSchemaVersion;
  type: TType;
  createdAt: string;
  payload: TPayload;
};

export type UploadAuditJobEnvelope = JobEnvelope<
  "upload-audit",
  {
    objectKey: string;
    sourceBucket?: string;
    targetBucket: string;
    status: UploadAuditStatus;
    checksum?: string;
  }
>;

export type MigrationAuditJobEnvelope = JobEnvelope<
  "migration-audit",
  {
    source: string;
    target: string;
    status: MigrationAuditStatus;
    sourceCount?: number;
    targetCount?: number;
    checksum?: string;
  }
>;

export type EmailDispatchJobEnvelope = JobEnvelope<
  "email-dispatch",
  {
    to: string;
    template: string;
    idempotencyKey: string;
    data?: Record<string, JsonPrimitive>;
  }
>;

export type ImportExportJobEnvelope = JobEnvelope<
  "import-export",
  {
    workspaceId: string;
    operation: ImportExportOperation;
    format: ImportExportFormat;
    requestedBy?: string;
  }
>;

export type CloudflareJobEnvelope =
  | UploadAuditJobEnvelope
  | MigrationAuditJobEnvelope
  | EmailDispatchJobEnvelope
  | ImportExportJobEnvelope;

export type JobEnvelopeValidationError = {
  code: "INVALID_JOB_ENVELOPE" | "UNSUPPORTED_JOB_TYPE" | "INVALID_JOB_PAYLOAD";
  message: string;
  field?: string;
  jobType?: string;
};

export type JobEnvelopeValidationResult =
  | { ok: true; envelope: CloudflareJobEnvelope }
  | { ok: false; error: JobEnvelopeValidationError };

export type QueueMessageLike = {
  id?: string;
  body: unknown;
  ack?: () => void | Promise<void>;
  retry?: (options?: { delaySeconds?: number }) => void | Promise<void>;
};

export type QueueBatchLike = {
  queue?: string;
  messages: QueueMessageLike[];
};

export type JobFailureRecord = {
  status: "failed";
  queueName: string;
  messageId: string;
  jobId: string | null;
  jobType: string | null;
  reason: JobEnvelopeValidationError["code"] | "JOB_HANDLER_FAILED";
  message: string;
  retryable: boolean;
  createdAt: string;
};

export type JobConsumerContext = {
  env: CloudflareBindings;
  queueName: string;
  messageId: string;
};

export type JobHandler<TJob extends CloudflareJobEnvelope = CloudflareJobEnvelope> = (
  job: TJob,
  context: JobConsumerContext
) => void | Promise<void>;

export type JobHandlers = {
  [TType in CloudflareJobType]?: JobHandler<Extract<CloudflareJobEnvelope, { type: TType }>>;
};

export type ConsumeJobQueueOptions = {
  handlers?: JobHandlers;
  recordFailure?: (failure: JobFailureRecord, context: JobConsumerContext) => void | Promise<void>;
  now?: () => Date;
};

export type JobConsumerSummary = {
  queueName: string;
  total: number;
  accepted: number;
  failed: number;
  failures: JobFailureRecord[];
  acceptedJobs: Array<{
    jobId: string;
    jobType: CloudflareJobType;
    status: "accepted";
  }>;
};

const uploadAuditStatuses = ["pending", "verified", "failed"] as const;
const migrationAuditStatuses = ["pending", "matched", "mismatched", "failed"] as const;
const importExportOperations = ["import", "export"] as const;
const importExportFormats = ["json", "csv", "zip"] as const;

export function validateJobEnvelope(input: unknown): JobEnvelopeValidationResult {
  if (!isRecord(input)) {
    return invalidEnvelope("Job body must be an object.", "body");
  }

  if (!isNonEmptyString(input.id)) {
    return invalidEnvelope("Job id must be a non-empty string.", "id");
  }

  if (input.schemaVersion !== 1) {
    return invalidEnvelope("Job schemaVersion must be 1.", "schemaVersion");
  }

  if (!isNonEmptyString(input.type)) {
    return invalidEnvelope("Job type must be a non-empty string.", "type");
  }

  if (!isSupportedJobType(input.type)) {
    return {
      ok: false,
      error: {
        code: "UNSUPPORTED_JOB_TYPE",
        message: `Unsupported Cloudflare Queue job type: ${input.type}`,
        field: "type",
        jobType: input.type,
      },
    };
  }

  if (!isNonEmptyString(input.createdAt) || Number.isNaN(Date.parse(input.createdAt))) {
    return invalidEnvelope("Job createdAt must be a valid ISO timestamp.", "createdAt", input.type);
  }

  const payloadError = validatePayload(input.type, input.payload);
  if (payloadError) {
    return { ok: false, error: payloadError };
  }

  return { ok: true, envelope: input as CloudflareJobEnvelope };
}

export async function consumeJobQueue(
  batch: QueueBatchLike,
  env: CloudflareBindings,
  options: ConsumeJobQueueOptions = {}
): Promise<JobConsumerSummary> {
  const queueName = batch.queue ?? "unknown-queue";

  const results = await Promise.all(
    batch.messages.map(async (message) => {
      const messageId = message.id ?? readStringField(message.body, "id") ?? "unknown-message";
      const context = { env, queueName, messageId };
      const validation = validateJobEnvelope(message.body);

      if (!validation.ok) {
        const failure = buildValidationFailure(queueName, messageId, message.body, validation.error, options.now);
        await options.recordFailure?.(failure, context);
        await message.ack?.();
        return { failure };
      }

      try {
        await runJobHandler(validation.envelope, context, options.handlers);
        await message.ack?.();
        return {
          acceptedJob: {
            jobId: validation.envelope.id,
            jobType: validation.envelope.type,
            status: "accepted" as const,
          },
        };
      } catch (error) {
        const failure = buildHandlerFailure(queueName, messageId, validation.envelope, error, options.now);
        await options.recordFailure?.(failure, context);
        await message.retry?.();
        return { failure };
      }
    })
  );

  const acceptedJobs = results.flatMap((result) => (result.acceptedJob ? [result.acceptedJob] : []));
  const failures = results.flatMap((result) => (result.failure ? [result.failure] : []));

  return {
    queueName,
    total: batch.messages.length,
    accepted: acceptedJobs.length,
    failed: failures.length,
    failures,
    acceptedJobs,
  };
}

function validatePayload(jobType: CloudflareJobType, payload: unknown): JobEnvelopeValidationError | null {
  if (!isRecord(payload)) {
    return invalidPayload("payload", jobType, "Job payload must be an object.");
  }

  switch (jobType) {
    case "upload-audit":
      return firstError([
        requireString(payload, "objectKey", jobType),
        optionalString(payload, "sourceBucket", jobType),
        requireString(payload, "targetBucket", jobType),
        requireEnum(payload.status, uploadAuditStatuses, "payload.status", jobType),
        optionalString(payload, "checksum", jobType),
      ]);
    case "migration-audit":
      return firstError([
        requireString(payload, "source", jobType),
        requireString(payload, "target", jobType),
        requireEnum(payload.status, migrationAuditStatuses, "payload.status", jobType),
        optionalCount(payload, "sourceCount", jobType),
        optionalCount(payload, "targetCount", jobType),
        optionalString(payload, "checksum", jobType),
      ]);
    case "email-dispatch":
      return firstError([
        requireString(payload, "to", jobType),
        requireString(payload, "template", jobType),
        requireString(payload, "idempotencyKey", jobType),
        optionalJsonData(payload.data, jobType),
      ]);
    case "import-export":
      return firstError([
        requireString(payload, "workspaceId", jobType),
        requireEnum(payload.operation, importExportOperations, "payload.operation", jobType),
        requireEnum(payload.format, importExportFormats, "payload.format", jobType),
        optionalString(payload, "requestedBy", jobType),
      ]);
  }
}

async function runJobHandler(
  envelope: CloudflareJobEnvelope,
  context: JobConsumerContext,
  handlers: JobHandlers | undefined
): Promise<void> {
  switch (envelope.type) {
    case "upload-audit":
      await handlers?.["upload-audit"]?.(envelope, context);
      return;
    case "migration-audit":
      await handlers?.["migration-audit"]?.(envelope, context);
      return;
    case "email-dispatch":
      await handlers?.["email-dispatch"]?.(envelope, context);
      return;
    case "import-export":
      await handlers?.["import-export"]?.(envelope, context);
      return;
  }
}

function invalidEnvelope(message: string, field: string, jobType?: string): JobEnvelopeValidationResult {
  return {
    ok: false,
    error: {
      code: "INVALID_JOB_ENVELOPE",
      message,
      field,
      jobType,
    },
  };
}

function invalidPayload(field: string, jobType: string, message: string): JobEnvelopeValidationError {
  return {
    code: "INVALID_JOB_PAYLOAD",
    message,
    field,
    jobType,
  };
}

function buildValidationFailure(
  queueName: string,
  messageId: string,
  body: unknown,
  error: JobEnvelopeValidationError,
  now: (() => Date) | undefined
): JobFailureRecord {
  return {
    status: "failed",
    queueName,
    messageId,
    jobId: readStringField(body, "id"),
    jobType: readStringField(body, "type"),
    reason: error.code,
    message: error.message,
    retryable: false,
    createdAt: (now?.() ?? new Date()).toISOString(),
  };
}

function buildHandlerFailure(
  queueName: string,
  messageId: string,
  envelope: CloudflareJobEnvelope,
  error: unknown,
  now: (() => Date) | undefined
): JobFailureRecord {
  return {
    status: "failed",
    queueName,
    messageId,
    jobId: envelope.id,
    jobType: envelope.type,
    reason: "JOB_HANDLER_FAILED",
    message: error instanceof Error ? error.message : "Queue job handler failed.",
    retryable: true,
    createdAt: (now?.() ?? new Date()).toISOString(),
  };
}

function firstError(errors: Array<JobEnvelopeValidationError | null>): JobEnvelopeValidationError | null {
  return errors.find((error) => error !== null) ?? null;
}

function requireString(
  payload: Record<string, unknown>,
  key: string,
  jobType: CloudflareJobType
): JobEnvelopeValidationError | null {
  return isNonEmptyString(payload[key])
    ? null
    : invalidPayload(`payload.${key}`, jobType, `Job payload field ${key} must be a non-empty string.`);
}

function optionalString(
  payload: Record<string, unknown>,
  key: string,
  jobType: CloudflareJobType
): JobEnvelopeValidationError | null {
  return payload[key] === undefined || isNonEmptyString(payload[key])
    ? null
    : invalidPayload(
        `payload.${key}`,
        jobType,
        `Optional job payload field ${key} must be a non-empty string when present.`
      );
}

function optionalCount(
  payload: Record<string, unknown>,
  key: string,
  jobType: CloudflareJobType
): JobEnvelopeValidationError | null {
  const value = payload[key];
  return value === undefined || (typeof value === "number" && Number.isInteger(value) && value >= 0)
    ? null
    : invalidPayload(
        `payload.${key}`,
        jobType,
        `Optional job payload field ${key} must be a non-negative integer when present.`
      );
}

function requireEnum<const TValues extends readonly string[]>(
  value: unknown,
  allowedValues: TValues,
  field: string,
  jobType: CloudflareJobType
): JobEnvelopeValidationError | null {
  return typeof value === "string" && allowedValues.includes(value)
    ? null
    : invalidPayload(field, jobType, `Job payload field ${field} has an unsupported value.`);
}

function optionalJsonData(value: unknown, jobType: CloudflareJobType): JobEnvelopeValidationError | null {
  if (value === undefined) {
    return null;
  }

  if (!isRecord(value)) {
    return invalidPayload("payload.data", jobType, "Email dispatch data must be an object when present.");
  }

  for (const [key, entry] of Object.entries(value)) {
    if (!isJsonPrimitive(entry)) {
      return invalidPayload(`payload.data.${key}`, jobType, "Email dispatch data values must be JSON primitives.");
    }
  }

  return null;
}

function isSupportedJobType(value: string): value is CloudflareJobType {
  return supportedJobTypes.includes(value as CloudflareJobType);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isJsonPrimitive(value: unknown): value is JsonPrimitive {
  return value === null || ["boolean", "number", "string"].includes(typeof value);
}

function readStringField(value: unknown, field: string): string | null {
  return isRecord(value) && typeof value[field] === "string" ? value[field] : null;
}
