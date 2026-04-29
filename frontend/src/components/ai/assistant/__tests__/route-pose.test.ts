import { describe, it, expect } from 'vitest';
import { defaultPoseForRoute, allowedPosesForRoute } from '../route-pose';

describe('defaultPoseForRoute', () => {
  it('returns sidebar for any /resume/... pathname (the actual resume editor route)', () => {
    expect(defaultPoseForRoute('/resume')).toBe('sidebar');
    expect(defaultPoseForRoute('/resume/abc-123')).toBe('sidebar');
    expect(defaultPoseForRoute('/resume/abc-123/print')).toBe('sidebar');
  });
  it('returns bar everywhere else', () => {
    expect(defaultPoseForRoute('/')).toBe('bar');
    expect(defaultPoseForRoute('/review')).toBe('bar');
    expect(defaultPoseForRoute('/upload')).toBe('bar');
    expect(defaultPoseForRoute('/walkthrough')).toBe('bar');
  });
});

describe('allowedPosesForRoute', () => {
  it('on /resume/... allows sidebar + orb only (no bar — D1)', () => {
    expect(allowedPosesForRoute('/resume')).toEqual(['sidebar', 'orb']);
    expect(allowedPosesForRoute('/resume/123')).toEqual(['sidebar', 'orb']);
  });
  it('on other routes allows bar only (no sidebar/orb — orb scoped to editor per c)', () => {
    expect(allowedPosesForRoute('/')).toEqual(['bar']);
    expect(allowedPosesForRoute('/review')).toEqual(['bar']);
  });
});
