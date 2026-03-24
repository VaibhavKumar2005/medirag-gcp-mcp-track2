#!/bin/sh
# Runtime environment injection for Vite SPA
# Replaces build-time placeholders with actual Cloud Run env values.
#
# Why sed with escaped replacement:
#   Raw env values can contain '&' which sed interprets as "the matched
#   string". We escape it first so any value is safe.

escape_sed() {
  # Escape & \ and / so they are treated as literals in the replacement
  printf '%s' "$1" | sed 's/[&/\]/\\&/g'
}

inject() {
  local placeholder="$1"
  local value
  value=$(escape_sed "$2")
  find /usr/share/nginx/html/assets -type f -name "*.js" \
    -exec sed -i "s|${placeholder}|${value}|g" {} +
  echo "Injected ${placeholder} → $2"
}

if [ -n "$VITE_API_URL" ]; then
  inject "__VITE_API_URL_PLACEHOLDER__" "$VITE_API_URL"
fi

if [ -n "$VITE_ADK_URL" ]; then
  inject "__VITE_ADK_URL_PLACEHOLDER__" "$VITE_ADK_URL"
fi

exec nginx -g "daemon off;"
