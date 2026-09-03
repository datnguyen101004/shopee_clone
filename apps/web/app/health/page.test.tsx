import { render, screen } from '@testing-library/react';

import HealthPage from './page';

describe('HealthPage', () => {
  it('renders a stable web identifier and healthy status', () => {
    render(<HealthPage />);

    expect(screen.getByText('Shopee Clone Web')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Status: ok');
  });
});
