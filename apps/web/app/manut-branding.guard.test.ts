import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const testDir = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(testDir, "..");
const repoRoot = resolve(webRoot, "../..");

describe("Manut public branding assets", () => {
  it("keeps direct favicon fallback files available for every frontend app", () => {
    const frontendApps = ["web", "admin", "space"];
    const requiredFiles = [
      "public/favicon.ico",
      "public/favicon/favicon-16x16.png",
      "public/favicon/favicon-32x32.png",
      "public/favicon/apple-touch-icon.png",
    ];

    for (const appName of frontendApps) {
      for (const requiredFile of requiredFiles) {
        const assetPath = resolve(repoRoot, "apps", appName, requiredFile);

        expect(existsSync(assetPath), `${appName}/${requiredFile} should exist`).toBe(true);
        expect(statSync(assetPath).size, `${appName}/${requiredFile} should not be empty`).toBeGreaterThan(0);
      }
    }
  });

  it("advertises one canonical web app manifest", () => {
    const sourceFiles = ["apps/web/app/root.tsx", "apps/web/app/layout.tsx"];

    for (const file of sourceFiles) {
      const contents = readFileSync(resolve(repoRoot, file), "utf8");
      const manifestLinkCount = contents.match(/rel:\s*"manifest"|rel="manifest"/g)?.length ?? 0;

      expect(manifestLinkCount, `${file} should expose only one manifest link`).toBe(1);
      expect(contents, `${file} should use the canonical PWA manifest`).toContain("/manifest.json");
      expect(contents, `${file} should not also advertise the favicon webmanifest`).not.toContain(
        "/site.webmanifest.json"
      );
    }
  });
});

describe("Manut user-facing copy", () => {
  const staleCopyChecks = [
    {
      file: "apps/web/manifest.json",
      forbidden: "Plane | Accelerate software development with peace.",
    },
    {
      file: "apps/web/app/(all)/accounts/set-password/layout.tsx",
      forbidden: "Set Password - Plane",
    },
    {
      file: "apps/web/app/(all)/accounts/reset-password/layout.tsx",
      forbidden: "Reset Password - Plane",
    },
    {
      file: "apps/web/app/(all)/accounts/forgot-password/layout.tsx",
      forbidden: "Forgot Password - Plane",
    },
    {
      file: "apps/web/app/(all)/sign-up/layout.tsx",
      forbidden: "Sign up - Plane",
    },
    {
      file: "apps/web/ce/components/onboarding/tour/sidebar.tsx",
      forbidden: "Get more out of Plane.",
    },
    {
      file: "apps/web/ce/components/instance/maintenance-message.tsx",
      forbidden: "Looks like Plane didn't start up correctly!",
    },
    {
      file: "apps/space/lib/instance-provider.tsx",
      forbidden: "Plane background pattern",
    },
  ];

  it.each(staleCopyChecks)("$file does not expose stale Plane copy", ({ file, forbidden }) => {
    const contents = readFileSync(resolve(repoRoot, file), "utf8");

    expect(contents).not.toContain(forbidden);
  });
});
