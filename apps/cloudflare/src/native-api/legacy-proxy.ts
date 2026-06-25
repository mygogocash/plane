/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { fetchLegacyOrigin } from "../edge-routing";
import type { CloudflareBindings } from "../types";
import { errorResponse, nativeApiHeaders } from "./http";

type ProxyLegacyApiOptions = {
  method?: string;
};

async function readProxyBody(request: Request, method: string): Promise<ArrayBuffer | undefined> {
  if (method === "GET" || method === "HEAD") {
    return undefined;
  }

  return request.arrayBuffer();
}

export async function proxyLegacyApi(
  request: Request,
  env: CloudflareBindings,
  path: string,
  options: ProxyLegacyApiOptions = {}
): Promise<Response> {
  const method = (options.method ?? request.method).toUpperCase();
  const appOrigin = env.APP_ORIGIN ?? "https://app.manut.xyz";
  const targetUrl = new URL(path, appOrigin);
  const body = await readProxyBody(request, method);

  const response = await fetchLegacyOrigin(
    new Request(targetUrl.toString(), {
      method,
      headers: request.headers,
      body,
    }),
    env,
    "api"
  );

  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(nativeApiHeaders())) {
    headers.set(key, value);
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export async function proxyLegacyApiGet(request: Request, env: CloudflareBindings, path: string): Promise<Response> {
  return proxyLegacyApi(request, env, path, { method: "GET" });
}

export async function proxyLegacyApiGetOrFail(
  request: Request,
  env: CloudflareBindings,
  path: string,
  errorCode: string,
  message: string
): Promise<Response> {
  try {
    return await proxyLegacyApiGet(request, env, path);
  } catch (error) {
    console.error(errorCode, error);
    return errorResponse(502, errorCode, message);
  }
}

export async function proxyLegacyApiOrFail(
  request: Request,
  env: CloudflareBindings,
  path: string,
  errorCode: string,
  message: string,
  options: ProxyLegacyApiOptions = {}
): Promise<Response> {
  try {
    return await proxyLegacyApi(request, env, path, options);
  } catch (error) {
    console.error(errorCode, error);
    return errorResponse(502, errorCode, message);
  }
}
