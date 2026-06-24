#!/usr/bin/env bash
set -euo pipefail

report_path="${1:-${RUNNER_TEMP:-}/phase-07-betterstack-cutover_21-06-26.json}"
summary_path="${GITHUB_STEP_SUMMARY:-/dev/stdout}"

append_summary() {
  {
    echo "### Better Stack cutover evidence"
    echo ""
    echo "$1"
  } >> "$summary_path"
}

if [ ! -s "$report_path" ]; then
  message="Better Stack cutover report was not generated; Phase 7 remains blocked."
  echo "::warning::${message}"
  append_summary "- Cutover report status: \`missing\`"
  exit 0
fi

if ! jq -e . "$report_path" >/dev/null 2>&1; then
  message="Better Stack cutover report is not valid JSON; Phase 7 remains blocked."
  echo "::warning::${message}"
  append_summary "- Cutover report status: \`invalid\`"
  exit 0
fi

ok="$(jq -r '.ok // false' "$report_path")"
monitor_passed="$(jq -r '.monitor_summary.passed // 0' "$report_path")"
monitor_total="$(jq -r '.monitor_summary.total // 0' "$report_path")"
endpoint_passed="$(jq -r '.endpoint_summary.passed // 0' "$report_path")"
endpoint_total="$(jq -r '.endpoint_summary.total // 0' "$report_path")"
status="blocked"

if [ "$ok" = "true" ]; then
  status="pass"
else
  echo "::warning::Better Stack cutover report is blocked; Phase 7 remains blocked."
fi

append_summary "- Cutover report status: \`${status}\`
- Monitor checks: \`${monitor_passed}/${monitor_total}\`
- Endpoint probes: \`${endpoint_passed}/${endpoint_total}\`
- Report path: \`${report_path}\`"

