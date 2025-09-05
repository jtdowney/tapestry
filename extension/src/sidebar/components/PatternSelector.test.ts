import { render } from '@testing-library/svelte';
import { describe, it, expect } from 'vitest';

import PatternSelector from './PatternSelector.svelte';

describe('PatternSelector', () => {
  it('should render select with patterns', () => {
    const patterns = ['pattern1', 'pattern2', 'pattern3'];
    const { getByRole, getByText } = render(PatternSelector, {
      props: { value: 'pattern1', patterns },
    });

    const select = getByRole('combobox');
    expect(select).toBeInTheDocument();
    expect(select).toHaveValue('pattern1');

    patterns.forEach((pattern) => {
      expect(getByText(pattern)).toBeInTheDocument();
    });
  });
});
