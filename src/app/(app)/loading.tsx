import { AppSkeleton } from "@/components/app-skeleton";

/**
 * Instant skeleton shown during navigation to any (app) route, so the first visit to a page
 * (which streams a dynamic server render) gives immediate feedback instead of feeling like a hang.
 * Rendered inside the layout's container, so no outer padding here.
 */
export default function Loading() {
  return <AppSkeleton />;
}
