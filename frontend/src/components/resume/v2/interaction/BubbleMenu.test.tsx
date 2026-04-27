import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { BubbleMenu } from './BubbleMenu';

describe('BubbleMenu', () => {
  it('renders nothing when editor is null', () => {
    const { container } = render(<BubbleMenu editor={null} />);
    expect(container.firstChild).toBeNull();
  });
});
