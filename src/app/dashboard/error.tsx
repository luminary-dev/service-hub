"use client";

// Segment error boundary for the provider dashboard (and its nested inquiry
// threads): a throw here retries in place instead of bubbling to the global
// boundary and losing the page context (#381).
export { default } from "@/components/ui/RouteError";
