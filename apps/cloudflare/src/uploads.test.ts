import { describe, expect, it } from "vitest";

import { handleUploadsRequest } from "./uploads";
import type { CloudflareBindings } from "./types";

type FakeObjectInit = {
  body: string;
  cacheControl?: string;
  contentDisposition?: string;
  contentType?: string;
  key: string;
  uploaded?: Date;
};

function buildFakeObject({
  body,
  cacheControl,
  contentDisposition,
  contentType,
  key,
  uploaded = new Date("2026-06-21T07:00:00.000Z"),
}: FakeObjectInit): R2ObjectBody {
  const bytes = new TextEncoder().encode(body);

  return {
    key,
    version: "fake-version",
    size: bytes.byteLength,
    etag: "fake-etag",
    httpEtag: '"fake-etag"',
    checksums: { toJSON: () => ({}) } as R2Checksums,
    uploaded,
    httpMetadata: {
      cacheControl,
      contentDisposition,
      contentType,
    },
    customMetadata: {},
    storageClass: "Standard",
    writeHttpMetadata(headers: Headers): void {
      if (contentType) {
        headers.set("content-type", contentType);
      }
      if (cacheControl) {
        headers.set("cache-control", cacheControl);
      }
      if (contentDisposition) {
        headers.set("content-disposition", contentDisposition);
      }
    },
    get body(): ReadableStream {
      return new Response(bytes).body ?? new ReadableStream();
    },
    get bodyUsed(): boolean {
      return false;
    },
    async arrayBuffer(): Promise<ArrayBuffer> {
      return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    },
    async bytes(): Promise<Uint8Array> {
      return bytes;
    },
    async text(): Promise<string> {
      return body;
    },
    async json<T>(): Promise<T> {
      return JSON.parse(body) as T;
    },
    async blob(): Promise<Blob> {
      return new Blob([bytes]);
    },
  };
}

class FakeR2Bucket {
  listCalls = 0;

  constructor(private readonly objects = new Map<string, R2ObjectBody>()) {}

  async get(key: string): Promise<R2ObjectBody | null> {
    return this.objects.get(key) ?? null;
  }

  async head(key: string): Promise<R2Object | null> {
    return this.objects.get(key) ?? null;
  }

  async list(): Promise<R2Objects> {
    this.listCalls += 1;
    throw new Error("anonymous bucket listing must not be called");
  }

  asBinding(): R2Bucket {
    return this as unknown as R2Bucket;
  }
}

function request(path: string, method = "GET"): Request {
  return new Request(`https://app.manut.xyz${path}`, { method });
}

function env(bucket?: FakeR2Bucket): CloudflareBindings {
  return {
    APP_ENV: "test",
    UPLOADS: bucket?.asBinding(),
  };
}

describe("R2 uploads compatibility handler", () => {
  it("denies bare uploads paths without listing the bucket", async () => {
    const bucket = new FakeR2Bucket();

    const responses = await Promise.all(
      ["/uploads", "/uploads/"].map((path) => handleUploadsRequest(request(path), env(bucket)))
    );

    await Promise.all(
      responses.map(async (response) => {
        expect(response.status).toBe(403);
        await expect(response.json()).resolves.toMatchObject({
          error: "R2_BUCKET_LISTING_DENIED",
        });
      })
    );

    expect(bucket.listCalls).toBe(0);
  });

  it("returns a JSON failure when the R2 binding is missing", async () => {
    const response = await handleUploadsRequest(request("/uploads/workspace/logo.png"), env());

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: "R2_UPLOADS_BINDING_MISSING",
      key: "workspace/logo.png",
    });
  });

  it("returns a JSON failure when the object is not found", async () => {
    const response = await handleUploadsRequest(request("/uploads/workspace/missing.png"), env(new FakeR2Bucket()));

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: "R2_OBJECT_NOT_FOUND",
      key: "workspace/missing.png",
    });
  });

  it("streams GET object reads with safe R2 metadata headers", async () => {
    const object = buildFakeObject({
      body: "image-bytes",
      cacheControl: "public, max-age=3600",
      contentDisposition: 'inline; filename="logo.png"',
      contentType: "image/png",
      key: "workspace/logo.png",
    });
    const bucket = new FakeR2Bucket(new Map([[object.key, object]]));

    const response = await handleUploadsRequest(request("/uploads/workspace/logo.png"), env(bucket));

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe("image-bytes");
    expect(response.headers.get("cache-control")).toBe("public, max-age=3600");
    expect(response.headers.get("content-disposition")).toBe('inline; filename="logo.png"');
    expect(response.headers.get("content-length")).toBe("11");
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("etag")).toBe('"fake-etag"');
    expect(response.headers.get("last-modified")).toBe("Sun, 21 Jun 2026 07:00:00 GMT");
  });

  it("returns HEAD object metadata without a response body", async () => {
    const object = buildFakeObject({
      body: "avatar",
      cacheControl: "private, max-age=60",
      contentType: "image/webp",
      key: "workspace/avatar.webp",
    });
    const bucket = new FakeR2Bucket(new Map([[object.key, object]]));

    const response = await handleUploadsRequest(request("/uploads/workspace/avatar.webp", "HEAD"), env(bucket));

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe("");
    expect(response.headers.get("cache-control")).toBe("private, max-age=60");
    expect(response.headers.get("content-length")).toBe("6");
    expect(response.headers.get("content-type")).toBe("image/webp");
  });
});
