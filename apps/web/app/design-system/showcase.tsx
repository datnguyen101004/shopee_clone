'use client';

import {
  Badge,
  Button,
  Card,
  CheckboxField,
  Dialog,
  DialogClose,
  DialogContent,
  DialogTrigger,
  Divider,
  EmptyState,
  ErrorState,
  Grid,
  Inline,
  InputField,
  LoadingState,
  Price,
  RadioField,
  Search,
  SelectField,
  Stack,
  TextareaField,
  useToast,
} from '@shopee-clone/ui';

const swatches = [
  ['Brand 500', 'var(--sc-color-brand-500)'],
  ['Brand 600', 'var(--sc-color-brand-600)'],
  ['Canvas', 'var(--sc-color-canvas)'],
  ['Surface', 'var(--sc-color-surface)'],
  ['Success', 'var(--sc-color-success)'],
  ['Danger', 'var(--sc-color-danger)'],
];

export function DesignSystemShowcase() {
  const { toast } = useToast();
  return (
    <Stack gap="8">
      <section className="showcase-section" aria-labelledby="tokens">
        <h2 id="tokens">Tokens</h2>
        <div className="swatch-grid">
          {swatches.map(([name, color]) => (
            <div className="swatch" key={name}>
              <span style={{ background: color }} />
              <strong>{name}</strong>
              <code>{color}</code>
            </div>
          ))}
        </div>
      </section>
      <section className="showcase-section" aria-labelledby="actions">
        <h2 id="actions">Actions & badges</h2>
        <Stack>
          <Inline>
            <Button leadingIcon={<Search aria-hidden="true" size={18} />}>Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="destructive">Xoá</Button>
            <Button loading>Đang tải</Button>
          </Inline>
          <Inline>
            {(['neutral', 'brand', 'success', 'warning', 'danger', 'info'] as const).map(
              (variant) => (
                <Badge variant={variant} key={variant}>
                  {variant}
                </Badge>
              ),
            )}
          </Inline>
        </Stack>
      </section>
      <section className="showcase-section" aria-labelledby="forms">
        <h2 id="forms">Forms</h2>
        <Grid minItemWidth="260px">
          <InputField label="Tìm kiếm" placeholder="Nhập từ khoá" hint="Tối thiểu 2 ký tự" />
          <InputField label="Mã giảm giá" value="SALE88" error="Mã đã hết hạn" readOnly />
          <SelectField label="Địa chỉ giao hàng" defaultValue="hcm">
            <option value="hcm">TP. Hồ Chí Minh</option>
            <option value="hn">Hà Nội</option>
          </SelectField>
          <TextareaField label="Ghi chú" placeholder="Lời nhắn cho người bán" optional />
          <CheckboxField
            label="Nhận thông báo ưu đãi"
            description="Có thể tắt bất cứ lúc nào"
            defaultChecked
          />
          <RadioField label="Thanh toán khi nhận hàng" name="payment" defaultChecked />
        </Grid>
      </section>
      <section className="showcase-section" aria-labelledby="commerce">
        <h2 id="commerce">Commerce composition</h2>
        <Grid minItemWidth="190px">
          <Card interactive>
            <Stack gap="3">
              <div className="showcase-product" aria-hidden="true">
                88
              </div>
              <Badge variant="danger">Mall</Badge>
              <strong>Tai nghe không dây</strong>
              <Price value={299000} originalValue={449000} />
            </Stack>
          </Card>
          <Card>
            <Stack>
              <Badge variant="success">Còn hàng</Badge>
              <h3>Đơn hàng #SC-1024</h3>
              <p>Giao dự kiến ngày mai</p>
              <Divider />
              <Button variant="outline" fullWidth>
                Theo dõi đơn
              </Button>
            </Stack>
          </Card>
        </Grid>
      </section>
      <section className="showcase-section" aria-labelledby="feedback">
        <h2 id="feedback">Feedback</h2>
        <Inline>
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline">Mở dialog</Button>
            </DialogTrigger>
            <DialogContent
              title="Xác nhận đơn hàng"
              description="Kiểm tra địa chỉ trước khi đặt hàng."
            >
              <Stack>
                <p>Sản phẩm sẽ được giao đến địa chỉ mặc định của bạn.</p>
                <Inline>
                  <DialogClose asChild>
                    <Button variant="outline">Quay lại</Button>
                  </DialogClose>
                  <DialogClose asChild>
                    <Button
                      onClick={() =>
                        toast({
                          title: 'Đặt hàng thành công',
                          description: 'Đơn hàng đang được xử lý.',
                          variant: 'success',
                        })
                      }
                    >
                      Xác nhận
                    </Button>
                  </DialogClose>
                </Inline>
              </Stack>
            </DialogContent>
          </Dialog>
          <Button
            onClick={() =>
              toast({
                title: 'Đã thêm vào giỏ',
                description: 'Tai nghe không dây · 1 sản phẩm',
                variant: 'success',
                action: {
                  label: 'Hoàn tác',
                  altText: 'Hoàn tác thêm vào giỏ',
                  onClick: () => undefined,
                },
              })
            }
          >
            Hiện toast
          </Button>
        </Inline>
      </section>
      <section className="showcase-section" aria-labelledby="states">
        <h2 id="states">Async states</h2>
        <div className="state-grid">
          <Card>
            <LoadingState count={2} />
          </Card>
          <Card>
            <EmptyState
              title="Giỏ hàng trống"
              description="Thêm sản phẩm bạn yêu thích để bắt đầu."
              action={<Button>Mua sắm ngay</Button>}
            />
          </Card>
          <Card>
            <ErrorState
              description="Kết nối bị gián đoạn. Vui lòng thử lại."
              onRetry={() => toast({ title: 'Đang tải lại', variant: 'info' })}
            />
          </Card>
        </div>
      </section>
    </Stack>
  );
}
