import { resolve4, resolve6, resolveCname } from "node:dns/promises";

const targets = [
  { name: "landing", url: "https://manut.xyz/" },
  { name: "app_instance", url: "https://app.manut.xyz/api/instances/" },
  { name: "uploads", url: "https://app.manut.xyz/uploads" },
];

async function resolveSafe(resolver, host) {
  try {
    return await resolver(host);
  } catch (error) {
    if (error?.code === "ENODATA" || error?.code === "ENOTFOUND") {
      return [];
    }
    return { error: error.message };
  }
}

async function fetchHead(target) {
  try {
    const response = await fetch(target.url, {
      method: "GET",
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
    });
    const text = await response.text();
    return {
      name: target.name,
      url: target.url,
      status: response.status,
      content_type: response.headers.get("content-type"),
      server: response.headers.get("server"),
      cf_ray: response.headers.get("cf-ray"),
      has_manut_keyword: text.includes("Manut"),
      body_sample: text.slice(0, 160),
    };
  } catch (error) {
    return {
      name: target.name,
      url: target.url,
      error: error.message,
    };
  }
}

const report = {
  generated_at: new Date().toISOString(),
  dns: {
    "manut.xyz": {
      a: await resolveSafe(resolve4, "manut.xyz"),
      aaaa: await resolveSafe(resolve6, "manut.xyz"),
      cname: await resolveSafe(resolveCname, "manut.xyz"),
    },
    "app.manut.xyz": {
      a: await resolveSafe(resolve4, "app.manut.xyz"),
      aaaa: await resolveSafe(resolve6, "app.manut.xyz"),
      cname: await resolveSafe(resolveCname, "app.manut.xyz"),
    },
  },
  endpoints: await Promise.all(targets.map(fetchHead)),
  rollback_anchor: {
    app_dns_gke_ip: "34.143.231.225",
    gke_namespace: "manut-ce",
    helm_release: "manut-app",
    gcs_uploads_bucket: "plane-affine-495114-uploads",
  },
};

console.log(JSON.stringify(report, null, 2));
