// k6 load script — hot browse/search read paths (#523 category query,
// #372 unbounded lists). ON-DEMAND ONLY: run manually against a stack to size
// the VPS and watch the Data Cache / gateway under concurrency. NOT wired into
// CI and NOT a gate.
//
//   BASE_URL=http://localhost:3000 k6 run load/k6/browse.js
//
// See docs/TESTING.md → "Load testing (k6)".
import http from "k6/http";
import { check, sleep } from "k6";

const BASE = __ENV.BASE_URL || "http://localhost:3000";

export const options = {
  stages: [
    { duration: "20s", target: 20 }, // ramp up
    { duration: "40s", target: 20 }, // hold
    { duration: "10s", target: 0 }, // ramp down
  ],
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<800"],
  },
};

const QUERIES = [
  "/api/providers?sort=rating",
  "/api/providers?category=electrician&pageSize=24",
  "/api/search/providers?district=Colombo&pageSize=24",
  "/api/search/providers?q=garden&pageSize=24",
];

export default function () {
  const path = QUERIES[Math.floor(Math.random() * QUERIES.length)];
  const res = http.get(`${BASE}${path}`);
  check(res, {
    "status 200": (r) => r.status === 200,
    "has providers": (r) => r.body.includes("providers"),
  });
  sleep(1);
}
