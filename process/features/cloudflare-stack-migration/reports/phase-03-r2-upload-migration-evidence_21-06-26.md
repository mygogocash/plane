# Phase 3 R2 Upload Migration Evidence

Captured: 2026-06-21T08:43:00Z

## Scope Completed

- Kept `/uploads/*` legacy-proxied by default.
- Added `R2_UPLOADS_READ_ENABLED=true` as the explicit switch for Worker-side R2 upload reads.
- Reused the existing R2 compatibility handler for:
  - anonymous listing denial on `/uploads` and `/uploads/`;
  - missing R2 binding failures;
  - missing object failures;
  - GET object streaming with R2 metadata headers;
  - HEAD object metadata responses.
- Added `apps/cloudflare/tools/compare-upload-manifests.mjs` and the
  `pnpm --filter @manut/cloudflare uploads:compare -- <gcs> <r2>` script for
  exploratory non-destructive manifest validation.
- Added cutover-grade strict validation through
  `pnpm --filter @manut/cloudflare uploads:validate -- <gcs> <r2> --out <report>`,
  which requires a shared checksum for every matched object.

## Route Behavior

| Condition                                                    | `/uploads/workspace/logo.png` behavior                     |
| ------------------------------------------------------------ | ---------------------------------------------------------- |
| `R2_UPLOADS_READ_ENABLED` unset                              | Legacy proxy candidate, current GKE/GCS behavior preserved |
| `R2_UPLOADS_READ_ENABLED=true` and `UPLOADS` binding missing | JSON `503`, `R2_UPLOADS_BINDING_MISSING`                   |
| `R2_UPLOADS_READ_ENABLED=true` and object missing            | JSON `404`, `R2_OBJECT_NOT_FOUND`                          |
| `R2_UPLOADS_READ_ENABLED=true` and object exists             | Streams object body/metadata from R2                       |

## Verification Commands

```bash
pnpm --filter @manut/cloudflare test -- --run src/index.test.ts
pnpm --filter @manut/cloudflare check
pnpm --filter @manut/cloudflare test
pnpm --filter @manut/cloudflare exec wrangler deploy --dry-run --env="" --outdir /tmp/manut-cloudflare-phase3-dry-run
pnpm --filter @manut/cloudflare baseline
pnpm --filter @manut/cloudflare uploads:validate -- <synthetic-gcs.json> <synthetic-r2.json> --json --out <report.json>
```

## Results

- Targeted upload-routing test: passed.
- `pnpm --filter @manut/cloudflare check`: passed.
- `pnpm --filter @manut/cloudflare test`: passed, 5 files and 38 tests.
- Wrangler dry-run: passed, upload size `256.85 KiB`, gzip `53.05 KiB`.
- Baseline:
  - `manut.xyz`: HTTP `200`, served by Cloudflare, contains `Manut`.
  - `app.manut.xyz/api/instances/`: HTTP `200`, current GKE app API remains reachable.
  - `app.manut.xyz`: DNS A record remains `34.143.231.225`.
  - `app.manut.xyz/uploads`: HTTP `403` XML GCS access-denied response, preserving current GCS-backed behavior.

Synthetic manifest comparison result:

```json
{
  "ok": true,
  "sourceObjectCount": 1,
  "targetObjectCount": 1,
  "matchedObjectCount": 1,
  "mismatchedObjectCount": 0,
  "mismatches": []
}
```

## Cutover Status

Blocked. No GCS objects were copied, no R2 bucket state was changed, and no production
upload routing was switched. The next operator action is to export real GCS/R2 manifests
from a preview or sampled non-production migration and compare them with
`uploads:validate`. The raw `uploads:compare` command is useful for exploratory
size/key checks but is not strong enough for Phase 7 cutover evidence.

Follow-up parser hardening on `2026-06-22` made `uploads:validate` accept raw
`gcloud storage objects list --format=json` checksum fields (`crc32c_hash`,
`md5_hash`) and nested R2 checksum objects. This removes the manual manifest
reshaping step, but the Phase 7 gate still requires a real GCS-to-R2 comparison
report from the final migration target.

## Rollback

Leave `R2_UPLOADS_READ_ENABLED` unset or set it to any value other than `true`.
Upload requests then continue to use the current legacy GKE/GCS path.
