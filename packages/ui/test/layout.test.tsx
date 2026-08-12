import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { PageShell } from '../src';

describe('PageShell', () => {
  it('renders only supplied landmarks and makes skip navigation first', async () => {
    const { container } = render(
      <PageShell>
        <h1>Marketplace</h1>
      </PageShell>,
    );
    expect(container.querySelectorAll('main')).toHaveLength(1);
    expect(container.querySelector('header')).not.toBeInTheDocument();
    expect(container.querySelector('nav')).not.toBeInTheDocument();
    expect(container.querySelector('footer')).not.toBeInTheDocument();
    await userEvent.tab();
    expect(screen.getByRole('link', { name: 'Bỏ qua đến nội dung chính' })).toHaveFocus();
  });
});
