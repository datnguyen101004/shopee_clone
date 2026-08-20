import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';

import {
  Button,
  Dialog,
  DialogContent,
  DialogTrigger,
  EmptyState,
  ErrorState,
  ToastProvider,
  useToast,
} from '../src';

function ToastDemo() {
  const { toast } = useToast();
  return (
    <Button onClick={() => toast({ title: 'Đã thêm vào giỏ', variant: 'success' })}>
      Thông báo
    </Button>
  );
}

describe('feedback components', () => {
  it('traps focus in a labelled dialog and restores it after Escape', async () => {
    const user = userEvent.setup();
    render(
      <Dialog>
        <DialogTrigger asChild>
          <Button>Mở</Button>
        </DialogTrigger>
        <DialogContent title="Xác nhận mua">
          <Button>Đồng ý</Button>
        </DialogContent>
      </Dialog>,
    );
    const trigger = screen.getByRole('button', { name: 'Mở' });
    await user.click(trigger);
    expect(screen.getByRole('dialog', { name: 'Xác nhận mua' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Đóng hộp thoại' })).toHaveFocus();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('announces and dismisses toast feedback', async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <ToastDemo />
      </ToastProvider>,
    );
    await user.click(screen.getByRole('button', { name: 'Thông báo' }));
    expect(screen.getByText('Đã thêm vào giỏ')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Đóng thông báo' }));
    await waitFor(() => expect(screen.queryByText('Đã thêm vào giỏ')).not.toBeInTheDocument());
  });

  it('auto-dismisses toast after the configured duration', async () => {
    function ShortToastDemo() {
      const { toast } = useToast();
      return (
        <Button
          onClick={() => toast({ title: 'Tự đóng', variant: 'danger', duration: 50 })}
        >
          Mở toast ngắn
        </Button>
      );
    }
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <ShortToastDemo />
      </ToastProvider>,
    );
    await user.click(screen.getByRole('button', { name: 'Mở toast ngắn' }));
    expect(screen.getByText('Tự đóng')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('Tự đóng')).not.toBeInTheDocument(), {
      timeout: 2000,
    });
  });

  it('renders accessible empty and error states', async () => {
    const retry = vi.fn();
    const { container } = render(
      <>
        <EmptyState title="Chưa có sản phẩm" description="Hãy thử danh mục khác." />
        <ErrorState description="Vui lòng thử lại." onRetry={retry} />
      </>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(retry).toHaveBeenCalledOnce();
    const results = await axe(container, { rules: { 'color-contrast': { enabled: false } } });
    expect(results.violations).toEqual([]);
  });
});
