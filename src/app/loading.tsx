import LoadingScreen from "@/components/LoadingScreen";

// Root loading fallback: the branded full-screen splash (#793), shown during
// initial navigation and as the fallback for any top-level route without a
// closer loading.tsx. Deeper routes (dashboard/, admin/, providers/[id]/…)
// keep their own layout-mirroring skeletons (#381), which win for their
// subtrees.
export default function Loading() {
  return <LoadingScreen />;
}
