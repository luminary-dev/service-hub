"use client";

// Segment error boundary for the admin console: a throw in any admin view
// retries in place (the admin layout stays mounted) instead of bubbling to
// the global boundary (#381).
export { default } from "@/components/ui/RouteError";
