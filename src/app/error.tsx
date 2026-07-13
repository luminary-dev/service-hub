"use client";

// Root route error boundary: renders inside the root layout (navbar and i18n
// provider stay available) with a retry that re-renders the failed segment.
export { default } from "@/components/ui/RouteError";
