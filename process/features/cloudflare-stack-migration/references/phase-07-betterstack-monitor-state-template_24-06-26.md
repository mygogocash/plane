# Phase 7 Better Stack Monitor State Template

This is a reference template only. Fill real Better Stack monitor IDs after the
monitors are configured, then pass the JSON file with:

```bash
pnpm --filter @manut/cloudflare betterstack:cutover-report -- \
  --monitor-state /path/to/betterstack-monitor-state.json \
  --out process/features/cloudflare-stack-migration/reports/phase-07-betterstack-cutover_21-06-26.json
```

Use this path only when `BETTERSTACK_API_TOKEN` is unavailable locally. With a
token, the report command queries Better Stack directly and does not need this
operator state file.

```json
{
  "monitors": [
    {
      "id": "betterstack-public-site-monitor-id",
      "name": "manut.xyz",
      "url": "https://manut.xyz",
      "status": "up"
    },
    {
      "id": "betterstack-app-root-monitor-id",
      "name": "app.manut.xyz",
      "url": "https://app.manut.xyz",
      "status": "up"
    },
    {
      "id": "betterstack-api-instances-monitor-id",
      "name": "app.manut.xyz API instances",
      "url": "https://app.manut.xyz/api/instances/",
      "status": "up"
    }
  ]
}
```
