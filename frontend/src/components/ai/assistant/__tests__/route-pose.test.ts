import { describe, it, expect } from 'vitest';
import { defaultPoseForRoute, allowedPosesForRoute } from '../route-pose';

describe('defaultPoseForRoute', () => {
  it('returns sidebar for any /editor/... pathname', () => {
    expect(defaultPoseForRoute('/editor')).toBe('sidebar');
    expect(defaultPoseForRoute('/editor/abc-123')).toBe('sidebar');
  });
  it('returns bar everywhere else', () => {
    expect(defaultPoseForRoute('/')).toBe('bar');
    expect(defaultPoseForRoute('/tracker')).toBe('bar');
    expect(defaultPoseForRoute('/insights')).toBe('bar');
  });
});

describe('allowedPosesForRoute', () => {
  it('on /editor allows sidebar + orb only (no bar — D1)', () => {
    expect(allowedPosesForRoute('/editor')).toEqual(['sidebar', 'orb']);
    expect(allowedPosesForRoute('/editor/123')).toEqual(['sidebar', 'orb']);
  });
  it('on other routes allows bar only (no sidebar/orb — orb scoped to editor per c)', () => {
    expect(allowedPosesForRoute('/')).toEqual(['bar']);
    expect(allowedPosesForRoute('/tracker')).toEqual(['bar']);
  });
});
