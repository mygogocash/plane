import type { CloudflareBindings } from "./types";

const UPLOADS_PREFIX = "/uploads";
const ALLOWED_METHODS = "GET, HEAD";

type JsonDetails = Record<string, string | string[]>;

function jsonFailure(status: number, error: string, message: string, details: JsonDetails = {}): Response {
  return Response.json(
    {
      error,
      message,
      ...details,
    },
    {
      status,
      headers: {
        "cache-control": "no-store",
      },
    }
  );
}

function decodeUploadKey(rawKey: string): string {
  try {
    return decodeURIComponent(rawKey);
  } catch {
    return rawKey;
  }
}

export function getUploadObjectKey(request: Request): string | null {
  const { pathname } = new URL(request.url);

  if (pathname === UPLOADS_PREFIX || pathname === `${UPLOADS_PREFIX}/`) {
    return null;
  }

  if (!pathname.startsWith(`${UPLOADS_PREFIX}/`)) {
    return null;
  }

  const rawKey = pathname.slice(`${UPLOADS_PREFIX}/`.length);
  return rawKey ? decodeUploadKey(rawKey) : null;
}

function buildObjectHeaders(object: R2Object): Headers {
  const headers = new Headers();

  try {
    object.writeHttpMetadata(headers);
  } catch {
    // Invalid object metadata should not prevent a compatible object read.
  }

  headers.set("content-length", object.size.toString());
  headers.set("etag", object.httpEtag);
  headers.set("last-modified", object.uploaded.toUTCString());

  if (object.httpMetadata?.cacheExpiry && !headers.has("expires")) {
    headers.set("expires", object.httpMetadata.cacheExpiry.toUTCString());
  }

  return headers;
}

function methodNotAllowed(): Response {
  const response = jsonFailure(405, "R2_UPLOAD_METHOD_NOT_ALLOWED", "Only GET and HEAD uploads reads are supported.", {
    allowed_methods: ["GET", "HEAD"],
  });
  response.headers.set("allow", ALLOWED_METHODS);
  return response;
}

export async function handleUploadsRequest(request: Request, env: CloudflareBindings): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return methodNotAllowed();
  }

  const key = getUploadObjectKey(request);

  if (!key) {
    return jsonFailure(403, "R2_BUCKET_LISTING_DENIED", "Anonymous uploads bucket listing is not allowed.");
  }

  if (!env.UPLOADS) {
    return jsonFailure(503, "R2_UPLOADS_BINDING_MISSING", "The R2 uploads bucket binding is not configured.", {
      key,
    });
  }

  if (request.method === "HEAD") {
    const object = await env.UPLOADS.head(key);

    if (!object) {
      return jsonFailure(404, "R2_OBJECT_NOT_FOUND", "The requested upload object was not found.", { key });
    }

    return new Response(null, {
      status: 200,
      headers: buildObjectHeaders(object),
    });
  }

  const object = await env.UPLOADS.get(key);

  if (!object) {
    return jsonFailure(404, "R2_OBJECT_NOT_FOUND", "The requested upload object was not found.", { key });
  }

  return new Response(object.body, {
    status: 200,
    headers: buildObjectHeaders(object),
  });
}
