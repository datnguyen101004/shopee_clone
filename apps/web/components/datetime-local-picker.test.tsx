import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { DateTimeLocalPicker } from './datetime-local-picker';

function Harness({ initial = '2026-08-19T11:25' }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  return (
    <div>
      <DateTimeLocalPicker aria-label="Bắt đầu" value={value} onChange={setValue} />
      <span data-testid="value">{value || 'empty'}</span>
    </div>
  );
}

const openStart = () => fireEvent.click(screen.getByRole('button', { name: 'Bắt đầu' }));

describe('DateTimeLocalPicker', () => {
  it('shows English AM/PM in the field instead of Vietnamese SA/CH', () => {
    render(<Harness />);
    expect(screen.getByRole('button', { name: 'Bắt đầu' })).toHaveTextContent('19/08/2026 11:25 AM');
    expect(screen.queryByText('SA')).not.toBeInTheDocument();
    expect(screen.queryByText('CH')).not.toBeInTheDocument();
  });

  it('opens a calendar with two-letter English weekdays and AM/PM columns', () => {
    render(<Harness />);
    openStart();
    expect(screen.getByRole('dialog', { name: /Tháng Tám 2026/ })).toBeInTheDocument();
    for (const day of ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']) {
      expect(screen.getByText(day)).toBeInTheDocument();
    }
    expect(screen.getByRole('option', { name: 'AM' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('option', { name: 'PM' })).toHaveAttribute('aria-selected', 'false');
    expect(screen.queryByRole('option', { name: 'SA' })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'CH' })).not.toBeInTheDocument();
  });

  it('converts 11 AM to 11 PM', () => {
    render(<Harness />);
    openStart();
    fireEvent.click(screen.getByRole('option', { name: 'PM' }));
    expect(screen.getByRole('button', { name: 'Bắt đầu' })).toHaveTextContent('19/08/2026 11:25 PM');
    expect(screen.getByTestId('value')).toHaveTextContent('2026-08-19T23:25');
  });

  it('formats midnight as 12:00 AM', () => {
    render(<Harness initial="2026-08-19T00:00" />);
    expect(screen.getByRole('button', { name: 'Bắt đầu' })).toHaveTextContent('19/08/2026 12:00 AM');
  });

  it('selects a calendar day, today, and clear', () => {
    render(<Harness />);
    openStart();
    fireEvent.click(screen.getByRole('button', { name: '20' }));
    expect(screen.getByTestId('value')).toHaveTextContent('2026-08-20T11:25');
    fireEvent.click(screen.getByRole('button', { name: 'Xóa' }));
    expect(screen.getByTestId('value')).toHaveTextContent('empty');
    fireEvent.click(screen.getByRole('button', { name: 'Hôm nay' }));
    expect(screen.getByTestId('value')).not.toHaveTextContent('empty');
  });

  it('date mode shows English weekdays and a date-only value', () => {
    function DateHarness() {
      const [value, setValue] = useState('2026-08-19');
      return (
        <div>
          <DateTimeLocalPicker mode="date" aria-label="Từ ngày" value={value} onChange={setValue} showClear={false} />
          <span data-testid="value">{value}</span>
        </div>
      );
    }
    render(<DateHarness />);
    expect(screen.getByRole('button', { name: 'Từ ngày' })).toHaveTextContent('19/08/2026');
    fireEvent.click(screen.getByRole('button', { name: 'Từ ngày' }));
    for (const day of ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']) {
      expect(screen.getByText(day)).toBeInTheDocument();
    }
    expect(screen.queryByRole('option', { name: 'AM' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '20' }));
    expect(screen.getByTestId('value')).toHaveTextContent('2026-08-20');
  });
});
