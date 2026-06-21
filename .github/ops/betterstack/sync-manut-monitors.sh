#!/usr/bin/env bash
set -euo pipefail

dry_run="${BETTERSTACK_DRY_RUN:-false}"
if [ "${1:-}" = "--dry-run" ]; then
  dry_run="true"
fi

api_base="${BETTERSTACK_API_BASE:-https://uptime.betterstack.com/api/v2}"
app_url="${BETTERSTACK_APP_URL:-${GCP_APP_URL:-https://app.manut.xyz}}"
app_url="${app_url%/}"
check_frequency="${BETTERSTACK_CHECK_FREQUENCY:-60}"
request_timeout="${BETTERSTACK_REQUEST_TIMEOUT:-30}"
app_keyword="${BETTERSTACK_APP_KEYWORD:-Manut}"
api_keyword="${BETTERSTACK_API_KEYWORD:-current_version}"
policy_id="${BETTERSTACK_POLICY_ID:-}"
monitor_group_id="${BETTERSTACK_MONITOR_GROUP_ID:-}"

need() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "::error::$1 is required to sync Better Stack monitors." >&2
    exit 1
  fi
}

need curl
need jq

monitor_definitions() {
  jq -nc \
    --arg app_url "$app_url" \
    --arg app_keyword "$app_keyword" \
    --arg api_keyword "$api_keyword" \
    '[
      {
        key: "app-root",
        pronounceable_name: "Manut production app",
        url: ($app_url + "/"),
        required_keyword: $app_keyword
      },
      {
        key: "api-instances",
        pronounceable_name: "Manut production API instances",
        url: ($app_url + "/api/instances/"),
        required_keyword: $api_keyword
      }
    ]'
}

build_payload() {
  local definition="$1"
  jq -nc \
    --argjson definition "$definition" \
    --argjson check_frequency "$check_frequency" \
    --argjson request_timeout "$request_timeout" \
    --arg policy_id "$policy_id" \
    --arg monitor_group_id "$monitor_group_id" \
    '{
      url: $definition.url,
      pronounceable_name: $definition.pronounceable_name,
      monitor_type: "status",
      http_method: "get",
      check_frequency: $check_frequency,
      request_timeout: $request_timeout,
      verify_ssl: true,
      follow_redirects: true,
      expected_status_codes: [200]
    }
    + (if ($definition.required_keyword // "") == "" then {} else {required_keyword: $definition.required_keyword} end)
    + (if $policy_id == "" then {} else {policy_id: $policy_id} end)
    + (if $monitor_group_id == "" then {} else {monitor_group_id: $monitor_group_id} end)'
}

request() {
  local method="$1"
  local path="$2"
  local payload="${3:-}"
  local body_file
  local http_code
  body_file="$(mktemp)"

  if [ -n "$payload" ]; then
    http_code="$(curl -sS -o "$body_file" -w "%{http_code}" \
      -X "$method" "${api_base}${path}" \
      -H "Authorization: Bearer ${BETTERSTACK_API_TOKEN}" \
      -H "Content-Type: application/json" \
      --data "$payload")"
  else
    http_code="$(curl -sS -o "$body_file" -w "%{http_code}" \
      -X "$method" "${api_base}${path}" \
      -H "Authorization: Bearer ${BETTERSTACK_API_TOKEN}" \
      -H "Content-Type: application/json")"
  fi

  if [ "$http_code" -ge 200 ] && [ "$http_code" -lt 300 ]; then
    cat "$body_file"
    rm -f "$body_file"
    return 0
  fi

  echo "::error::Better Stack API ${method} ${path} failed with HTTP ${http_code}." >&2
  sed -e 's/[[:cntrl:]]//g' "$body_file" >&2 || true
  echo >&2
  rm -f "$body_file"
  return 1
}

if [ "$dry_run" = "true" ]; then
  monitor_definitions | jq --argjson check_frequency "$check_frequency" --argjson request_timeout "$request_timeout" '
    {
      dry_run: true,
      check_frequency: $check_frequency,
      request_timeout: $request_timeout,
      monitors: .
    }'
  exit 0
fi

if [ -z "${BETTERSTACK_API_TOKEN:-}" ]; then
  echo "::warning::BETTERSTACK_API_TOKEN is not configured; skipping Better Stack monitor sync."
  exit 0
fi

monitors="$(request GET "/monitors")"

monitor_definitions | jq -c '.[]' | while IFS= read -r definition; do
  name="$(jq -r '.pronounceable_name' <<<"$definition")"
  url="$(jq -r '.url' <<<"$definition")"
  payload="$(build_payload "$definition")"
  existing_id="$(jq -r --arg name "$name" --arg url "$url" '
    [
      .data[]?
      | select((.attributes.pronounceable_name == $name) or (.attributes.url == $url))
      | .id
    ][0] // ""
  ' <<<"$monitors")"

  if [ -n "$existing_id" ]; then
    echo "Updating Better Stack monitor ${name} (${existing_id})"
    request PATCH "/monitors/${existing_id}" "$payload" >/dev/null
  else
    echo "Creating Better Stack monitor ${name}"
    request POST "/monitors" "$payload" >/dev/null
  fi
done

echo "Better Stack monitor sync completed for ${app_url}."
