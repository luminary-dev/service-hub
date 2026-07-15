// k6 load script — auth login path + the gateway's Redis sliding-window rate
// limiter (authStrict: 8 logins / 15 min / IP) under concurrency. ON-DEMAND
// ONLY: validates the limiter holds and sheds load with 429s rather than
// falling over. NOT wired into CI and NOT a gate.
//
//   BASE_URL=http://localhost:3000 k6 run load/k6/login.js
//
// Expect a burst of 200s up to the window, then 429s — that is the limiter
// working, not a failure. See docs/TESTING.md → "Load testing (k6)".
import http from "k6/http";
import { check } from "k6";

const BASE = __ENV.BASE_URL || "http://localhost:3000";

export const options = {
  vus: 10,
  duration: "30s",
};

export default function () {
  const res = http.post(
    `${BASE}/api/auth/login`,
    JSON.stringify({ email: "admin@baas.lk", password: "password123" }),
    { headers: { "Content-Type": "application/json", Origin: BASE } },
  );
  // Either authenticated (200) or shed by the limiter (429) is acceptable;
  // a 5xx would mean the gateway buckled.
  check(res, {
    "not a server error": (r) => r.status < 500,
  });
}
