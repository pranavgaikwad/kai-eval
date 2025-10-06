#!/usr/bin/env bash
set -euo pipefail

usage() {
	echo "Usage: $(basename "$0") <directory> <rule_id>" >&2
	exit 1
}

if ! command -v jq >/dev/null 2>&1; then
	echo "Error: jq is required but not installed." >&2
	exit 1
fi

if [ "$#" -ne 2 ]; then
	usage
fi

DIR="$1"
RULE_ID="$2"

if [ ! -d "$DIR" ]; then
	echo "Error: Directory not found: $DIR" >&2
	exit 1
fi

# Collect JSON files (non-recursive)
mapfile -d '' -t JSON_FILES < <(find "$DIR" -maxdepth 1 -type f -name '*.json' -print0)

if [ "${#JSON_FILES[@]}" -eq 0 ]; then
	echo "Error: No JSON files found in directory: $DIR" >&2
	exit 1
fi

# Run jq to aggregate description, first message, and unique URIs
JQ_RESULT="$(jq -rs --arg rule "$RULE_ID" '
	# Flatten all files into a single array of entries
	[ .[]? | .[]? ] 
	| map(.violations?[$rule]?) 
	| map(select(. != null))
	| {
		description: (map(.description) | map(select(. != null)) | .[0]),
		message: (map(.incidents? | .[0]? | .message) | map(select(. != null)) | .[0]),
		uris: (map(.incidents? | map(.uri) | .[]) | map(select(. != null)) | unique)
	}
' "${JSON_FILES[@]}")"

# Detect if nothing matched
if ! jq -e '.description != null or .message != null or ((.uris // []) | length > 0)' >/dev/null <<<"$JQ_RESULT"; then
	echo "No violations found for rule: $RULE_ID" >&2
	exit 2
fi

DESCRIPTION="$(jq -r '.description // ""' <<<"$JQ_RESULT")"
MESSAGE="$(jq -r '.message // ""' <<<"$JQ_RESULT")"

# Print output
printf "%s\n" "$DESCRIPTION"
printf "%s\n" "$MESSAGE"
printf "%s\n" "These issues were found in files:"
jq -r '.uris[]? // empty' <<<"$JQ_RESULT"


