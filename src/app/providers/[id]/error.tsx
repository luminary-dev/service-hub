"use client";

// Segment error boundary for the provider profile: a failed profile load
// retries in place instead of bubbling to the global boundary (#381).
export { default } from "@/components/ui/RouteError";
