import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Search } from 'lucide-react';
import { axe } from 'vitest-axe';

import {
  Badge,
  Button,
  ButtonLink,
  Card,
  CheckboxField,
  Icon,
  InputField,
  Price,
  SelectField,
  TextareaField,
} from '../src';

describe('UI primitives', () => {
  it('renders button variants, icons, and unavailable states correctly', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <>
        <Button leadingIcon={<Search data-testid="search" />} onClick={onClick}>
          Tìm kiếm
        </Button>
        <Button loading>Đang lưu</Button>
        <ButtonLink href="/cart" disabled>
          Giỏ hàng
        </ButtonLink>
      </>,
    );
    await user.click(screen.getByRole('button', { name: 'Tìm kiếm' }));
    expect(onClick).toHaveBeenCalledOnce();
    expect(screen.getByTestId('search')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Đang lưu/ })).toBeDisabled();
    expect(screen.getByRole('link', { name: 'Giỏ hàng' })).toHaveAttribute('aria-disabled', 'true');
  });

  it('associates labels, hints, and errors with form controls', () => {
    render(
      <>
        <InputField label="Email" hint="Dùng email hợp lệ" />
        <TextareaField label="Mô tả" error="Bắt buộc" />
        <SelectField label="Tỉnh thành">
          <option>TP. Hồ Chí Minh</option>
        </SelectField>
        <CheckboxField label="Nhận ưu đãi" />
      </>,
    );
    expect(screen.getByLabelText('Email')).toHaveAccessibleDescription('Dùng email hợp lệ');
    expect(screen.getByLabelText('Mô tả')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Tỉnh thành')).toBeInTheDocument();
    expect(screen.getByLabelText('Nhận ưu đãi')).toHaveAttribute('type', 'checkbox');
  });

  it('provides semantic display primitives without accessibility violations', async () => {
    const { container } = render(
      <Card>
        <Badge variant="brand">Yêu thích</Badge>
        <Price value={129000} originalValue={159000} />
        <Icon icon={Search} label="Tìm kiếm" />
      </Card>,
    );
    expect(screen.getByRole('img', { name: 'Tìm kiếm' })).toBeInTheDocument();
    const results = await axe(container, { rules: { 'color-contrast': { enabled: false } } });
    expect(results.violations).toEqual([]);
  });
});
