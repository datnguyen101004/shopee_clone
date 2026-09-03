import { render, screen } from '@testing-library/react';
import { ToastProvider } from '@shopee-clone/ui';

import DesignSystemPage from './page';

describe('DesignSystemPage', () => {
  it('exposes reusable foundations and one main landmark', () => {
    const { container } = render(
      <ToastProvider>
        <DesignSystemPage />
      </ToastProvider>,
    );
    expect(
      screen.getByRole('heading', { level: 1, name: 'Nền tảng giao diện marketplace' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Tokens' })).toBeInTheDocument();
    expect(container.querySelectorAll('main')).toHaveLength(1);
  });
});
