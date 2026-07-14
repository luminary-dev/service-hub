#!/usr/bin/env bash
# End-to-end smoke test against a running stack (web on :3000 through the
# gateway). Requires: a running stack (scripts/dev-all.sh or docker compose),
# curl, jq. Reseeds the databases first, so it is repeatable — but the
# gateway's in-memory rate limits persist across runs (authStrict: 8 logins /
# 15 min / IP; this script uses 4), so after a few back-to-back runs restart
# the gateway or wait out the window.
set -uo pipefail

# Rate-limit windows persist in Redis across runs (shared client-IP bucket
# when x-forwarded-for is absent) — start each run with a clean slate.
docker compose exec -T redis redis-cli flushall >/dev/null 2>&1 || true
cd "$(dirname "$0")/.."

WEB="${WEB_URL:-http://localhost:3000}"
JAR_DIR="$(mktemp -d)"
RUN_TAG="$(date +%s)"
PASS=0
FAIL=0

echo "== Reseeding databases =="
for s in identity-service provider-service review-service job-service; do
  (cd "services/$s" && npm run --silent db:seed >/dev/null) || echo "warn: reseed $s failed"
done

check() { # check <name> <actual> <expected-substring-or-value>
  local name="$1" actual="$2" expected="$3"
  if [[ "$actual" == *"$expected"* ]]; then
    PASS=$((PASS + 1)); echo "ok   - $name"
  else
    FAIL=$((FAIL + 1)); echo "FAIL - $name (expected '$expected', got '${actual:0:200}')"
  fi
}

req() { # req <jar> <method> <path> [curl args...]
  local jar="$JAR_DIR/$1" method="$2" path="$3"; shift 3
  curl -sS -X "$method" "$WEB$path" -b "$jar" -c "$jar" -H "Origin: $WEB" "$@"
}

echo "== Health =="
for port in 4000 4001 4002 4003 4004 4005 4006 4008; do
  check "healthz :$port" "$(curl -sS "http://localhost:$port/healthz")" '"ok":true'
done

echo "== Public pages =="
check "home page renders" "$(curl -sS "$WEB/")" "Baas"
check "providers page renders" "$(curl -sS "$WEB/providers")" "Baas"

echo "== Public API through web rewrite =="
LIST=$(req anon GET "/api/providers?sort=rating")
check "providers list total=6" "$(echo "$LIST" | jq -r .total)" "6"
check "providers have ratings" "$(echo "$LIST" | jq -r '.providers[0].rating != null')" "true"
PROV_ID=$(echo "$LIST" | jq -r '.providers[0].id')
check "provider detail page" "$(curl -sS "$WEB/providers/$PROV_ID")" "Baas"
check "stats endpoint" "$(req anon GET "/api/stats" | jq -r '.providerCount')" "6"

echo "== Search service (index + browse parity) =="
# The index is derived and starts empty — populate it from the seeded source
# of truth first (the sweep the ops cron runs daily). 4008 is loopback-bound.
check "search reindex" "$(curl -sS -X POST "http://localhost:4008/internal/search/reindex" \
  -H "x-internal-secret: ${INTERNAL_API_SECRET:-dev-internal-secret}" | jq -r '.indexed >= 6')" "true"

# Shadow-compare /api/search/providers against /api/providers (search RFC
# phase 2 parity): same filters must select the same providers. Ordered
# comparison only where the sort is fully deterministic on the seed data
# (sort=price — distinct fromPrices); elsewhere ties (equal ratings/createdAt
# ms) make order legitimately unstable, so the ID SETS are compared.
parity_set() { # parity_set <name> <query-string>
  local browse search
  browse=$(req anon GET "/api/providers?$2" | jq -cS '[.providers[].id] | sort')
  search=$(req anon GET "/api/search/providers?$2" | jq -cS '[.providers[].id] | sort')
  check "parity (set): $1" "$search" "$browse"
}
parity_ordered() { # parity_ordered <name> <query-string>
  local browse search
  browse=$(req anon GET "/api/providers?$2" | jq -c '[.providers[].id]')
  search=$(req anon GET "/api/search/providers?$2" | jq -c '[.providers[].id]')
  check "parity (ordered): $1" "$search" "$browse"
}
parity_set "no filters" "pageSize=24"
parity_set "category" "category=mechanic&pageSize=24"
parity_set "district membership" "district=Colombo&pageSize=24"
parity_set "available only" "availableOnly=1&pageSize=24"
parity_set "price range" "priceMin=2000&priceMax=7000&pageSize=24"
parity_set "rating minimum" "ratingMin=5&pageSize=24"
parity_set "free text" "q=garden&pageSize=24"
parity_ordered "price sort" "sort=price&pageSize=24"
check "parity: totals" "$(req anon GET "/api/search/providers" | jq -r '.total')" \
  "$(req anon GET "/api/providers" | jq -r '.total')"

# Geo (RFC §5.1): the seed pins two Colombo-area providers; a 25 km radius
# from Colombo Fort finds both, nearest first with a distance on each card.
NEARBY=$(req anon GET "/api/search/providers/nearby?lat=6.9271&lng=79.8612&radiusKm=25")
check "nearby finds pinned providers" "$(echo "$NEARBY" | jq -r '.total')" "2"
check "nearby carries distanceKm" "$(echo "$NEARBY" | jq -r '.providers[0].distanceKm != null')" "true"
check "nearby requires coordinates" "$(req anon GET "/api/search/providers/nearby" | jq -r '.error')" "lat and lng are required"

echo "== Auth =="
check "login admin" "$(req admin POST "/api/auth/login" -H 'content-type: application/json' \
  -d '{"email":"admin@baas.lk","password":"password123"}' | jq -r '.user.role')" "ADMIN"
check "me is admin" "$(req admin GET "/api/auth/me" | jq -r '.user.role')" "ADMIN"
check "logout" "$(req anon POST "/api/auth/logout" | jq -r '.ok')" "true"
check "me after logout" "$(req anon GET "/api/auth/me" | jq -r '.user')" "null"

EMAIL="e2e-$RUN_TAG@example.com"
check "register customer" "$(req cust POST "/api/auth/register" -H 'content-type: application/json' \
  -d "{\"role\":\"CUSTOMER\",\"name\":\"E2E Customer\",\"email\":\"$EMAIL\",\"password\":\"e2e-smoke-pass-9x\",\"phone\":\"0770000001\"}" \
  | jq -r '.user.role')" "CUSTOMER"
check "bad login rejected" "$(req anon POST "/api/auth/login" -H 'content-type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"wrong\"}" | jq -r '.error')" "Invalid email or password"

echo "== Favorites =="
check "favorite add" "$(req cust POST "/api/favorites/$PROV_ID" | jq -r '.favorited')" "true"
check "favorites list" "$(req cust GET "/api/favorites" | jq -r '.providerIds | index("'"$PROV_ID"'") != null')" "true"
check "account page renders" "$(req cust GET "/account")" "Baas"
check "favorite remove" "$(req cust DELETE "/api/favorites/$PROV_ID" | jq -r '.favorited')" "false"

echo "== Inquiries + reviews =="
check "inquiry create" "$(req cust POST "/api/providers/$PROV_ID/inquiries" -H 'content-type: application/json' \
  -d '{"name":"E2E Customer","phone":"0770000001","message":"This is an end to end inquiry message."}' \
  | jq -r '.inquiry.status')" "NEW"
# The review gate (#25) requires a real prior interaction with the SAME provider,
# so establish an inquiry to prov_sampath before reviewing it.
check "inquiry to review target" "$(req cust POST "/api/providers/prov_sampath/inquiries" -H 'content-type: application/json' \
  -d '{"name":"E2E Customer","phone":"0770000001","message":"Interested in your services before I leave a review."}' \
  | jq -r '.inquiry.status')" "NEW"
check "review create" "$(req cust POST "/api/providers/prov_sampath/reviews" \
  -F rating=5 -F comment='Great work, E2E approved!' | jq -r '.ok')" "true"
check "review visible" "$(curl -sS "http://localhost:4003/internal/by-provider/prov_sampath" \
  -H "x-internal-secret: ${INTERNAL_API_SECRET:-dev-internal-secret}" \
  | jq -r '.reviews[0].comment')" "E2E approved"

echo "== Jobs (reverse marketplace) =="
# Job posting is gated on a verified email (#556): the freshly registered
# customer must be blocked, so the job flow runs as a seeded (verified) one.
check "unverified job post blocked" "$(req cust POST "/api/jobs" -H 'content-type: application/json' \
  -d '{"category":"mechanic","district":"Colombo","title":"E2E gated job post","description":"An unverified account must not be able to post this job."}' | jq -r '.error')" "Verify your email"
req jobcust POST "/api/auth/login" -H 'content-type: application/json' \
  -d '{"email":"dilani@example.com","password":"password123"}' > /dev/null
JOB_ID=$(req jobcust POST "/api/jobs" -H 'content-type: application/json' \
  -d '{"category":"mechanic","district":"Colombo","title":"E2E brake inspection","description":"My car needs a brake inspection as soon as possible please."}' | jq -r '.id')
check "job created" "$(test -n "$JOB_ID" && test "$JOB_ID" != "null" && echo yes)" "yes"

# provider nuwan is a mechanic in Colombo — sees the board and responds
req prov POST "/api/auth/login" -H 'content-type: application/json' \
  -d '{"email":"nuwan@example.com","password":"password123"}' > /dev/null
check "board shows job" "$(req prov GET "/api/jobs/board" | jq -r '(.jobs // []) | map(.id) | index("'"$JOB_ID"'") != null')" "true"
check "job respond" "$(req prov POST "/api/jobs/$JOB_ID/responses" -H 'content-type: application/json' \
  -d '{"message":"I can inspect your brakes tomorrow morning."}' | jq -r '.ok')" "true"
check "duplicate respond blocked" "$(req prov POST "/api/jobs/$JOB_ID/responses" -H 'content-type: application/json' \
  -d '{"message":"I can inspect your brakes tomorrow morning."}' | jq -r '.error')" "already responded"
check "dashboard payload" "$(req prov GET "/api/provider/dashboard" | jq -r '.provider.id')" "prov_nuwan"
check "dashboard page renders" "$(req prov GET "/dashboard")" "Baas"

check "job mine shows response" "$(req jobcust GET "/api/jobs/mine" | jq -r '(.jobs // []) | map(select(.id=="'"$JOB_ID"'")) | .[0].responses | length')" "1"

# Response scoping (must mirror the board query): out-of-category/district and
# own-job responses are rejected even with a valid job id.
OTHER_JOB=$(req jobcust POST "/api/jobs" -H 'content-type: application/json' \
  -d '{"category":"plumber","district":"Kandy","title":"E2E out-of-scope job","description":"A plumbing job in Kandy that nuwan the Colombo mechanic must not answer."}' | jq -r '.id')
check "out-of-scope respond blocked" "$(req prov POST "/api/jobs/$OTHER_JOB/responses" -H 'content-type: application/json' \
  -d '{"message":"I should not be allowed to respond to this."}' | jq -r '.error')" "outside your category or district"
NUWAN_JOB=$(req prov POST "/api/jobs" -H 'content-type: application/json' \
  -d '{"category":"mechanic","district":"Colombo","title":"E2E own job","description":"A job posted by nuwan who then must not be able to respond to it."}' | jq -r '.id')
check "own-job respond blocked" "$(req prov POST "/api/jobs/$NUWAN_JOB/responses" -H 'content-type: application/json' \
  -d '{"message":"Responding to my own job should fail."}' | jq -r '.error')" "You cannot respond to your own job"

check "job close" "$(req jobcust PATCH "/api/jobs/$JOB_ID" -H 'content-type: application/json' -d '{"status":"CLOSED"}' | jq -r '.ok')" "true"

echo "== Provider registration orchestration =="
PEMAIL="e2e-prov-$RUN_TAG@example.com"
PNAME="E2E Plumber $RUN_TAG"
PREG=$(req newprov POST "/api/auth/register" -H 'content-type: application/json' -d "{
  \"role\":\"PROVIDER\",\"name\":\"$PNAME\",\"email\":\"$PEMAIL\",\"password\":\"e2e-smoke-pass-9x\",\"phone\":\"0770000002\",
  \"category\":\"plumber\",\"headline\":\"E2E plumbing headline\",\"bio\":\"A bio for the e2e plumbing provider that is long enough to pass validation.\",
  \"district\":\"Colombo\",\"city\":\"Colombo\",\"experience\":3,
  \"services\":[{\"title\":\"Leak fix\",\"price\":2500,\"priceType\":\"VISIT\"}]}")
NEW_PROV_ID=$(echo "$PREG" | jq -r '.providerId')
check "provider register returns providerId" "$(test -n "$NEW_PROV_ID" && test "$NEW_PROV_ID" != "null" && echo yes)" "yes"
check "new provider searchable" "$(req anon GET "/api/providers?q=$RUN_TAG" | jq -r '.total')" "1"

echo "== Admin =="
check "admin providers list" "$(req admin GET "/api/admin/providers" | jq -r '.providers | length >= 7')" "true"
check "admin suspend" "$(req admin PATCH "/api/admin/providers/$NEW_PROV_ID" -H 'content-type: application/json' \
  -d '{"action":"suspend"}' | jq -r '.ok')" "true"
check "suspended hidden from search" "$(req anon GET "/api/providers?q=$RUN_TAG" | jq -r '.total')" "0"
# Suspended profiles must 404 on the legacy detail endpoint (PII leak) and
# reject new reviews — not just drop out of search.
check "suspended provider detail 404" "$(req anon GET "/api/providers/$NEW_PROV_ID" | jq -r '.error')" "Provider not found"
check "review on suspended blocked" "$(req cust POST "/api/providers/$NEW_PROV_ID/reviews" \
  -F rating=5 -F comment='E2E must be rejected on a suspended provider' | jq -r '.error')" "Provider not found"
check "admin unsuspend" "$(req admin PATCH "/api/admin/providers/$NEW_PROV_ID" -H 'content-type: application/json' \
  -d '{"action":"unsuspend"}' | jq -r '.ok')" "true"
check "admin verify" "$(req admin PATCH "/api/admin/providers/$NEW_PROV_ID" -H 'content-type: application/json' \
  -d '{"action":"verify"}' | jq -r '.ok')" "true"
check "admin page renders" "$(req admin GET "/admin/providers")" "Baas"

echo "== CSRF protection =="
check "cross-site POST blocked" "$(curl -sS -X POST "$WEB/api/auth/logout" \
  -H "Origin: https://evil.example.com" | jq -r '.error')" "Cross-site request blocked."

echo
echo "== Results: $PASS passed, $FAIL failed =="
rm -rf "$JAR_DIR"
[ "$FAIL" -eq 0 ]
