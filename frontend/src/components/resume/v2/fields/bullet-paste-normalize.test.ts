// frontend/src/components/resume/v2/fields/bullet-paste-normalize.test.ts
import { describe, it, expect, vi } from 'vitest';
import {
  splitHtmlIntoParagraphs,
  plainTextToBulletDoc,
  makeTransformPastedHTML,
} from './bullet-paste-normalize';

describe('splitHtmlIntoParagraphs', () => {
  it('single <p> → 1 paragraph', () => {
    expect(splitHtmlIntoParagraphs('<p>hello</p>')).toEqual(['hello']);
  });
  it('multiple <p> → multiple', () => {
    expect(splitHtmlIntoParagraphs('<p>a</p><p>b</p><p>c</p>')).toEqual(['a', 'b', 'c']);
  });
  it('plain text with <br> splits', () => {
    expect(splitHtmlIntoParagraphs('hello<br><br>world')).toEqual(['hello', 'world']);
  });
  it('nested div handled', () => {
    expect(splitHtmlIntoParagraphs('<div>a</div><div>b</div>')).toEqual(['a', 'b']);
  });
  it('list items become paragraphs', () => {
    expect(splitHtmlIntoParagraphs('<ul><li>a</li><li>b</li></ul>')).toEqual(['a', 'b']);
  });
});

describe('plainTextToBulletDoc', () => {
  it('builds 1-tuple doc', () => {
    const doc = plainTextToBulletDoc('hello');
    expect(doc.content.length).toBe(1);
    expect(doc.content[0].content?.[0]).toEqual({ type: 'text', text: 'hello' });
  });
  it('empty text → paragraph with no content', () => {
    expect(plainTextToBulletDoc('').content[0].content).toBeUndefined();
  });
});

describe('makeTransformPastedHTML', () => {
  it('1 paragraph → no spawn, returns html as-is', () => {
    const spawn = vi.fn();
    const fn = makeTransformPastedHTML('b1', spawn);
    expect(fn('<p>hello</p>')).toBe('<p>hello</p>');
    expect(spawn).not.toHaveBeenCalled();
  });
  it('N paragraphs → spawn N-1, return first wrapped', () => {
    const spawn = vi.fn();
    const fn = makeTransformPastedHTML('b1', spawn);
    const out = fn('<p>a</p><p>b</p><p>c</p>');
    expect(out).toBe('<p>a</p>');
    expect(spawn).toHaveBeenCalledWith('b1', ['b', 'c']);
  });
});
