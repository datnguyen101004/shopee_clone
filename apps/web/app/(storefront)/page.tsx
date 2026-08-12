import {
  Badge,
  Button,
  Card,
  Cluster,
  Container,
  Grid,
  Heart,
  Inline,
  Price,
  ShoppingCart,
  Star,
  Truck,
} from '@shopee-clone/ui';
import Link from 'next/link';

const products = [
  {
    name: 'Tai nghe Bluetooth chống ồn Pro',
    price: 299000,
    old: 449000,
    sold: '2,1k',
    color: 'coral',
    badge: 'Mall',
  },
  {
    name: 'Bình giữ nhiệt inox 500ml',
    price: 119000,
    old: 179000,
    sold: '985',
    color: 'mint',
    badge: 'Yêu thích',
  },
  {
    name: 'Áo thun cotton form rộng unisex',
    price: 89000,
    old: 139000,
    sold: '5,8k',
    color: 'violet',
    badge: 'Bán chạy',
  },
  {
    name: 'Đèn bàn LED chống cận sạc USB',
    price: 159000,
    old: 249000,
    sold: '749',
    color: 'amber',
    badge: 'Freeship',
  },
  {
    name: 'Túi đeo chéo chống nước tối giản',
    price: 139000,
    old: 219000,
    sold: '1,3k',
    color: 'sky',
    badge: 'Giảm 36%',
  },
  {
    name: 'Bộ chăm sóc da dịu nhẹ 3 bước',
    price: 349000,
    old: 520000,
    sold: '622',
    color: 'rose',
    badge: 'Mall',
  },
];
const categories = [
  ['Thiết bị điện tử', '⚡'],
  ['Thời trang', '👕'],
  ['Nhà cửa & đời sống', '🏠'],
  ['Sắc đẹp', '✨'],
  ['Bách hoá', '🛒'],
  ['Thể thao', '🏸'],
];

export default function HomePage() {
  return (
    <Container className="home-flow">
      <section className="hero" aria-labelledby="hero-title">
        <div className="hero__content">
          <Badge variant="brand">8.8 Siêu hội săn deal</Badge>
          <h1 id="hero-title">
            Mua sắm thả ga,
            <br />
            <span>deal về đầy nhà</span>
          </h1>
          <p>Khám phá hàng ngàn sản phẩm nổi bật với ưu đãi mỗi ngày.</p>
          <Inline>
            <Button size="lg">Săn deal ngay</Button>
            <Button size="lg" variant="outline">
              Xem Flash Sale
            </Button>
          </Inline>
        </div>
        <div className="hero__art" aria-hidden="true">
          <div className="hero__parcel">
            88<small>SALE</small>
          </div>
          <div className="hero__bubble hero__bubble--one">-50%</div>
          <div className="hero__bubble hero__bubble--two">₫0</div>
        </div>
      </section>
      <section aria-labelledby="benefits-title">
        <h2 className="sc-visually-hidden" id="benefits-title">
          Quyền lợi mua sắm
        </h2>
        <div className="benefit-strip">
          <span>
            <Truck aria-hidden="true" />
            Miễn phí vận chuyển
          </span>
          <span>✓ Cam kết chính hãng</span>
          <span>↩ Đổi trả dễ dàng</span>
        </div>
      </section>
      <section aria-labelledby="categories-title">
        <Cluster className="section-heading">
          <h2 id="categories-title">Danh mục</h2>
          <Link href="/design-system">Xem tất cả →</Link>
        </Cluster>
        <Grid minItemWidth="130px" className="category-grid">
          {categories.map(([name, emoji]) => (
            <Card interactive key={name} className="category-card">
              <span aria-hidden="true">{emoji}</span>
              <strong>{name}</strong>
            </Card>
          ))}
        </Grid>
      </section>
      <section aria-labelledby="products-title">
        <Cluster className="section-heading">
          <div>
            <Badge variant="danger">HOT</Badge>
            <h2 id="products-title">Gợi ý hôm nay</h2>
          </div>
          <Link href="/design-system">Khám phá thêm →</Link>
        </Cluster>
        <div className="product-grid">
          {products.map((product, index) => (
            <Card interactive key={product.name} className="product-card">
              <div className={`product-card__image product-card__image--${product.color}`}>
                <span>{String(index + 1).padStart(2, '0')}</span>
                <button className="product-card__heart" aria-label={`Yêu thích ${product.name}`}>
                  <Heart aria-hidden="true" size={19} />
                </button>
                <Badge variant={product.badge === 'Mall' ? 'danger' : 'brand'}>
                  {product.badge}
                </Badge>
              </div>
              <div className="product-card__body">
                <h3>{product.name}</h3>
                <div className="product-card__rating">
                  <Star aria-hidden="true" size={14} fill="currentColor" /> 4.9 · Đã bán{' '}
                  {product.sold}
                </div>
                <Cluster>
                  <Price value={product.price} originalValue={product.old} />
                  <button className="product-card__add" aria-label={`Thêm ${product.name} vào giỏ`}>
                    <ShoppingCart aria-hidden="true" size={18} />
                  </button>
                </Cluster>
              </div>
            </Card>
          ))}
        </div>
      </section>
      <section className="seller-banner">
        <div>
          <span>TRỞ THÀNH NGƯỜI BÁN</span>
          <h2>Bắt đầu kinh doanh cùng chúng tôi</h2>
          <p>Tiếp cận hàng triệu người mua và quản lý cửa hàng dễ dàng.</p>
        </div>
        <Button variant="outline">Mở shop ngay</Button>
      </section>
    </Container>
  );
}
