// frontend/src/components/ai/assistant/route-pose.ts
import type { AssistantPose } from '@/stores/assistant';

/** Default pose when entering a route. Per D1 / c. */
export function defaultPoseForRoute(pathname: string): AssistantPose {
  return pathname === '/resume' || pathname.startsWith('/resume/') ? 'sidebar' : 'bar';
}

/** Which poses the user is allowed to switch to from a given route.
 *  Per D1 (no bar inside /editor) and c (orb only in /editor). */
export function allowedPosesForRoute(pathname: string): AssistantPose[] {
  if (pathname === '/resume' || pathname.startsWith('/resume/')) {
    return ['sidebar', 'orb'];
  }
  return ['bar'];
}
