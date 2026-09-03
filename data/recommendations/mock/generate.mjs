import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Workbook } from '@oai/artifact-tool';

const OUTPUT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DATASET_VERSION = 'mock-reco-v1';
const SEED = 20260902;
const PROFILE_GENERATED_AT = '2026-09-02T08:00:00.000Z';
const MODEL_VERSION = 1;
const FEATURE_SCHEMA_VERSION = 1;

const categories = [
  ['cat-electronics', 'Điện thoại & phụ kiện', 'Điện thoại'],
  ['cat-computers', 'Máy tính & laptop', 'Laptop'],
  ['cat-home', 'Nhà cửa & đời sống', 'Gia dụng'],
  ['cat-kitchen', 'Nhà bếp', 'Nồi'],
  ['cat-fashion-women', 'Thời trang nữ', 'Áo nữ'],
  ['cat-fashion-men', 'Thời trang nam', 'Áo nam'],
  ['cat-beauty', 'Sắc đẹp', 'Kem dưỡng'],
  ['cat-sports', 'Thể thao & du lịch', 'Giày chạy'],
  ['cat-mother-baby', 'Mẹ & bé', 'Bình sữa'],
  ['cat-books', 'Sách & văn phòng phẩm', 'Sách'],
  ['cat-pets', 'Thú cưng', 'Thức ăn thú cưng'],
  ['cat-grocery', 'Bách hóa online', 'Cà phê'],
].map(([id, name, noun]) => ({ id, name, noun }));

const shops = Array.from({ length: 12 }, (_, index) => ({
  id: `shop-${String(index + 1).padStart(2, '0')}`,
  name: [
    'Tech Sao Việt',
    'Laptop Nhà Mình',
    'Home Mộc',
    'Bếp Xinh',
    'Nàng Style',
    'Men Daily',
    'Beauty Lab',
    'Run & Camp',
    'Mẹ Tròn Con Vuông',
    'Trang Sách',
    'Pet Corner',
    'Góc Bếp Việt',
  ][index],
}));

const userPreferences = {
  dat1: {
    offset: 7,
    preferredCategoryIds: ['cat-electronics', 'cat-computers', 'cat-home', 'cat-books'],
    secondaryCategoryIds: ['cat-kitchen', 'cat-sports'],
    preferredShopIds: ['shop-01', 'shop-02', 'shop-03', 'shop-10'],
    priceCenterMinor: 650_000,
    priceToleranceMinor: 550_000,
  },
  dat2: {
    offset: 31,
    preferredCategoryIds: ['cat-fashion-women', 'cat-beauty', 'cat-sports', 'cat-mother-baby'],
    secondaryCategoryIds: ['cat-home', 'cat-pets'],
    preferredShopIds: ['shop-05', 'shop-07', 'shop-08', 'shop-09'],
    priceCenterMinor: 420_000,
    priceToleranceMinor: 360_000,
  },
};

const productBasesByCategory = {
  'cat-electronics': ['Tai nghe Bluetooth', 'Ốp lưng điện thoại', 'Cáp sạc nhanh', 'Sạc dự phòng', 'Loa Bluetooth', 'Camera mini', 'Kính cường lực', 'Bút cảm ứng', 'Hub USB', 'Đồng hồ thông minh'],
  'cat-computers': ['Laptop văn phòng', 'Màn hình máy tính', 'Bàn phím cơ', 'Chuột không dây', 'Balo laptop', 'Webcam học online', 'Ổ cứng di động', 'Giá đỡ laptop', 'Máy in mini', 'USB lưu trữ'],
  'cat-home': ['Đèn bàn học', 'Kệ sách gỗ', 'Ghế thư giãn', 'Rèm cửa chống nắng', 'Thảm phòng khách', 'Gối tựa sofa', 'Hộp đựng đồ', 'Cây lau nhà', 'Máy hút bụi', 'Tinh dầu khuếch tán'],
  'cat-kitchen': ['Nồi chiên không dầu', 'Bình giữ nhiệt', 'Nồi cơm điện', 'Chảo chống dính', 'Máy xay sinh tố', 'Ấm siêu tốc', 'Bộ hộp bảo quản', 'Dao nhà bếp', 'Kệ gia vị', 'Cân nhà bếp'],
  'cat-fashion-women': ['Áo thun nữ', 'Váy công sở', 'Quần jeans nữ', 'Áo khoác nữ', 'Chân váy chữ A', 'Đầm dự tiệc', 'Túi đeo chéo nữ', 'Kính mát nữ', 'Mũ rộng vành', 'Khăn lụa nữ'],
  'cat-fashion-men': ['Áo sơ mi nam', 'Áo polo nam', 'Quần jeans nam', 'Áo khoác nam', 'Quần kaki nam', 'Giày sneaker nam', 'Ví da nam', 'Thắt lưng nam', 'Mũ lưỡi trai', 'Kính mát nam'],
  'cat-beauty': ['Kem dưỡng ẩm', 'Son môi', 'Sữa rửa mặt', 'Nước hoa nữ', 'Mặt nạ dưỡng da', 'Kem chống nắng', 'Dầu gội thảo mộc', 'Máy rửa mặt', 'Serum vitamin C', 'Bộ cọ trang điểm'],
  'cat-sports': ['Giày chạy bộ', 'Bình nước thể thao', 'Áo thể thao', 'Balo du lịch', 'Thảm yoga', 'Dây kháng lực', 'Găng tay tập gym', 'Lều cắm trại', 'Đèn pin dã ngoại', 'Túi đeo hông'],
  'cat-mother-baby': ['Bình sữa em bé', 'Tã dán sơ sinh', 'Xe đẩy em bé', 'Ghế ăn dặm', 'Đồ chơi xếp hình', 'Chăn cotton em bé', 'Sữa tắm trẻ em', 'Nhiệt kế điện tử', 'Yếm ăn dặm', 'Túi trữ sữa'],
  'cat-books': ['Sách kỹ năng', 'Tiểu thuyết Việt Nam', 'Sách thiếu nhi', 'Sổ tay kế hoạch', 'Bút gel văn phòng', 'Bộ màu vẽ', 'Sách học tiếng Anh', 'Lịch để bàn', 'Giấy ghi chú', 'Tạp chí phong cách sống'],
  'cat-pets': ['Thức ăn cho mèo', 'Thức ăn cho chó', 'Cát vệ sinh mèo', 'Bát ăn thú cưng', 'Đồ chơi cho mèo', 'Vòng cổ thú cưng', 'Lược chải lông', 'Chuồng thú cưng', 'Dầu tắm thú cưng', 'Tấm lót vệ sinh'],
  'cat-grocery': ['Cà phê rang xay', 'Trà thảo mộc', 'Mật ong nguyên chất', 'Hạt dinh dưỡng', 'Bánh quy bơ', 'Mì ăn liền', 'Nước ép trái cây', 'Gia vị nấu ăn', 'Ngũ cốc ăn sáng', 'Socola đen'],
};

const modelNames = ['Nova', 'Luna', 'Aster', 'Mộc', 'Pro', 'Lite', 'Plus', 'Max', 'Go', 'S'];

function normalizeVietnamese(value) {
  return value
    .toLocaleLowerCase('vi-VN')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replaceAll('đ', 'd')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function round(value, digits = 4) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function csvCell(value) {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function csvText(headers, rows) {
  return [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

function hash(value) {
  let current = SEED >>> 0;
  for (const char of String(value)) {
    current = Math.imul(current ^ char.charCodeAt(0), 16777619) >>> 0;
  }
  return current >>> 0;
}

function isoDate(dayOffset, minuteOffset) {
  const start = Date.parse('2026-06-01T00:00:00.000Z');
  return new Date(start + dayOffset * 86_400_000 + minuteOffset * 60_000).toISOString();
}

function productCategory(index) {
  return categories[Math.floor(index / 10) % categories.length];
}

function productShop(index) {
  return shops[(index * 5 + Math.floor(index / categories.length)) % shops.length];
}

function makeProducts() {
  const products = [];
  for (let index = 0; index < 120; index += 1) {
    const category = productCategory(index);
    const shop = productShop(index);
    const baseName = productBasesByCategory[category.id][index % 10];
    const model = modelNames[Math.floor(index / 10) % modelNames.length];
    const name = `${baseName} ${model} ${String(index + 1).padStart(3, '0')}`;
    const priceMinor = 80_000 + ((hash(`price:${index}`) % 500) * 10_000);
    const ratingAverageBasisPoints = 370 + (hash(`rating:${index}`) % 126);
    const ratingCount = 12 + (hash(`rating-count:${index}`) % 2_400);
    const soldCount = 20 + (hash(`sold:${index}`) % 12_000);
    const inventoryAvailable = index % 17 !== 0;
    const promotionActive = index % 5 === 0 || index % 11 === 0;
    const freshnessDays = hash(`freshness:${index}`) % 180;
    products.push({
      product_id: `product-${String(index + 1).padStart(3, '0')}`,
      dataset_version: DATASET_VERSION,
      projection_version: 1,
      product_name: name,
      normalized_name: normalizeVietnamese(name),
      description: `${baseName} chính hãng, phù hợp nhu cầu mua sắm thử nghiệm cho ${category.name}.`,
      category_id: category.id,
      category_name: category.name,
      shop_id: shop.id,
      shop_name: shop.name,
      price_minor: priceMinor,
      rating_average_basis_points: ratingAverageBasisPoints,
      rating_count: ratingCount,
      sold_count: soldCount,
      inventory_available: inventoryAvailable ? 1 : 0,
      promotion_active: promotionActive ? 1 : 0,
      freshness_days: freshnessDays,
      displayable: inventoryAvailable ? 1 : 0,
    });
  }
  return products;
}

function chooseProduct(products, userId, index, preferred) {
  const preference = userPreferences[userId];
  const pool = products.filter((product) => {
    const categoryPreferred = preference.preferredCategoryIds.includes(product.category_id);
    const shopPreferred = preference.preferredShopIds.includes(product.shop_id);
    return preferred ? categoryPreferred || shopPreferred : !categoryPreferred && !shopPreferred;
  });
  return pool[(index * 17 + preference.offset) % pool.length] ?? products[index % products.length];
}

function makeEvents(products) {
  const rows = [];
  const eventTypes = [
    ['PRODUCT_VIEW', 420],
    ['FAVORITE', 90],
    ['ORDER_COMPLETED', 45],
    ['SHOP_FOLLOW', 45],
    ['ORDER_CANCELLED', 10],
  ];
  for (const [userId, preference] of Object.entries(userPreferences)) {
    let cursor = 0;
    for (const [eventType, count] of eventTypes) {
      for (let occurrence = 0; occurrence < count; occurrence += 1) {
        const isShopEvent = eventType === 'SHOP_FOLLOW';
        const validForProfile = eventType !== 'ORDER_CANCELLED';
        const preferred = occurrence % 5 !== 0;
        const product = isShopEvent ? null : chooseProduct(products, userId, cursor + occurrence, preferred);
        const shopId = isShopEvent
          ? preference.preferredShopIds[(occurrence + preference.offset) % preference.preferredShopIds.length]
          : product.shop_id;
        const categoryId = product?.category_id ?? '';
        const dayOffset = (cursor + occurrence + preference.offset) % 90;
        const minuteOffset = (hash(`${userId}:${eventType}:${occurrence}`) % 1_440);
        rows.push([
          `${userId}-event-${String(rows.length + 1).padStart(4, '0')}`,
          DATASET_VERSION,
          SEED,
          userId,
          eventType,
          product?.product_id ?? '',
          categoryId,
          shopId,
          isoDate(dayOffset, minuteOffset),
          eventType === 'PRODUCT_VIEW' ? 1 : eventType === 'FAVORITE' ? 3 : eventType === 'SHOP_FOLLOW' ? 3 : eventType === 'ORDER_COMPLETED' ? 5 : 0,
          eventType === 'ORDER_COMPLETED' ? 'order-history' : eventType === 'SHOP_FOLLOW' ? 'shop-following' : 'storefront',
          validForProfile ? 1 : 0,
        ]);
      }
      cursor += count;
    }
  }
  return rows;
}

function makeAggregates(products, eventRows) {
  const aggregates = new Map();
  for (const userId of Object.keys(userPreferences)) {
    aggregates.set(userId, { views: new Map(), favorites: new Set(), orders: new Map(), follows: new Set(), totalWeight: 0 });
  }
  for (const row of eventRows) {
    const [, , , userId, eventType, productId, , shopId, , weight, , validForProfile] = row;
    if (validForProfile !== 1) continue;
    const aggregate = aggregates.get(userId);
    aggregate.totalWeight += Number(weight);
    if (eventType === 'PRODUCT_VIEW' && productId) aggregate.views.set(productId, (aggregate.views.get(productId) ?? 0) + 1);
    if (eventType === 'FAVORITE' && productId) aggregate.favorites.add(productId);
    if (eventType === 'ORDER_COMPLETED' && productId) aggregate.orders.set(productId, (aggregate.orders.get(productId) ?? 0) + 1);
    if (eventType === 'SHOP_FOLLOW') aggregate.follows.add(shopId);
  }
  return aggregates;
}

function makeProfiles(products, aggregates) {
  const headers = [
    'user_id', 'dataset_version', 'profile_version', 'feature_schema_version', 'generated_at',
    'eligible', 'eligibility_score', 'view_count_30d', 'favorite_count_90d', 'followed_shop_count',
    'order_count_90d', 'preferred_category_ids', 'preferred_shop_ids', 'preferred_price_min_minor',
    'preferred_price_max_minor', 'recent_product_ids', 'source',
  ];
  const rows = [];
  for (const [userId, preference] of Object.entries(userPreferences)) {
    const aggregate = aggregates.get(userId);
    const preferredProducts = products.filter((product) =>
      preference.preferredCategoryIds.includes(product.category_id) || preference.preferredShopIds.includes(product.shop_id),
    );
    const recentProductIds = preferredProducts.slice(0, 20).map((product) => product.product_id).join('|');
    const preferredPrices = preferredProducts.map((product) => product.price_minor);
    const viewCount30d = Math.floor(aggregate.views.size * 0.65);
    const orderCount90d = aggregate.orders.size;
    const eligibilityScore = Math.min(100, viewCount30d + aggregate.favorites.size * 3 + aggregate.follows.size * 3 + orderCount90d * 5);
    rows.push([
      userId, DATASET_VERSION, 1, FEATURE_SCHEMA_VERSION, PROFILE_GENERATED_AT, eligibilityScore >= 5 ? 1 : 0,
      eligibilityScore, viewCount30d, aggregate.favorites.size, aggregate.follows.size, orderCount90d,
      preference.preferredCategoryIds.join('|'), preference.preferredShopIds.join('|'), Math.min(...preferredPrices),
      Math.max(...preferredPrices), recentProductIds, 'synthetic-behavior-weighted',
    ]);
  }
  return { headers, rows };
}

function makeTrainingExamples(products, aggregates) {
  const headers = [
    'example_id', 'dataset_version', 'random_seed', 'model_version', 'feature_schema_version', 'split', 'fold',
    'user_id', 'product_id', 'category_id', 'shop_id', 'impression_at', 'label', 'label_source',
    'category_affinity', 'shop_affinity', 'view_count_30d', 'favorite_flag', 'followed_shop_flag',
    'order_count_90d', 'preferred_price_distance', 'price_band_match', 'rating_average_basis_points',
    'rating_confidence', 'sold_count_log1p', 'promotion_active', 'freshness_score', 'text_relevance',
    'inventory_available', 'profile_score', 'sample_weight',
  ];
  const rows = [];
  for (const [userIndex, [userId, preference]] of Object.entries(userPreferences).entries()) {
    const aggregate = aggregates.get(userId);
    const preferred = products.filter((product) =>
      preference.preferredCategoryIds.includes(product.category_id) || preference.preferredShopIds.includes(product.shop_id),
    );
    const nonPreferred = products.filter((product) =>
      !preference.preferredCategoryIds.includes(product.category_id) && !preference.preferredShopIds.includes(product.shop_id),
    );
    for (let index = 0; index < 1_500; index += 1) {
      const label = index % 2 === 0 ? 1 : 0;
      const pool = label === 1 ? preferred : nonPreferred;
      const product = pool[(Math.floor(index / 2) * 19 + preference.offset + userIndex * 7) % pool.length];
      const categoryAffinity = preference.preferredCategoryIds.includes(product.category_id) ? 1 : 0.2;
      const shopAffinity = preference.preferredShopIds.includes(product.shop_id) ? 1 : 0.1;
      const viewCount = aggregate.views.get(product.product_id) ?? 0;
      const favoriteFlag = aggregate.favorites.has(product.product_id) ? 1 : 0;
      const followedShopFlag = aggregate.follows.has(product.shop_id) ? 1 : 0;
      const orderCount = aggregate.orders.get(product.product_id) ?? 0;
      const preferredPriceDistance = Math.min(1, Math.abs(product.price_minor - preference.priceCenterMinor) / preference.priceToleranceMinor);
      const priceBandMatch = preferredPriceDistance <= 0.5 ? 1 : 0;
      const ratingConfidence = round(Math.min(1, product.rating_count / 1_000));
      const soldCountLog1p = round(Math.log1p(product.sold_count));
      const freshnessScore = round(Math.max(0, 1 - product.freshness_days / 365));
      const textRelevance = round(Math.min(1, 0.35 + categoryAffinity * 0.45 + (index % 7) / 35));
      const profileScore = Math.min(100, aggregate.totalWeight);
      const split = index % 5 === 0 ? 'heldout' : 'train';
      rows.push([
        `${userId}-pair-${String(index + 1).padStart(4, '0')}`, DATASET_VERSION, SEED, MODEL_VERSION,
        FEATURE_SCHEMA_VERSION, split, index % 5, userId, product.product_id, product.category_id, product.shop_id,
        isoDate((index + preference.offset) % 90, hash(`${userId}:impression:${index}`) % 1_440), label,
        'synthetic-preference-rule', round(categoryAffinity), round(shopAffinity), viewCount, favoriteFlag,
        followedShopFlag, orderCount, round(preferredPriceDistance), priceBandMatch, product.rating_average_basis_points,
        ratingConfidence, soldCountLog1p, product.promotion_active, freshnessScore, textRelevance,
        product.inventory_available, profileScore, 1,
      ]);
    }
  }
  return { headers, rows };
}

function rowsFromObject(headers, objects) {
  return objects.map((object) => headers.map((header) => object[header]));
}

async function main() {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  const products = makeProducts();
  const productHeaders = Object.keys(products[0]);
  const productRows = rowsFromObject(productHeaders, products);
  const eventHeaders = [
    'event_id', 'dataset_version', 'random_seed', 'user_id', 'event_type', 'product_id', 'category_id',
    'shop_id', 'event_at', 'event_weight', 'source', 'valid_for_profile',
  ];
  const eventRows = makeEvents(products);
  const aggregates = makeAggregates(products, eventRows);
  const profileSheet = makeProfiles(products, aggregates);
  const trainingSheet = makeTrainingExamples(products, aggregates);

  const sheets = [
    ['products', productHeaders, productRows, 'mock_products.csv'],
    ['buyer_events', eventHeaders, eventRows, 'mock_buyer_events.csv'],
    ['buyer_profiles', profileSheet.headers, profileSheet.rows, 'mock_buyer_profiles.csv'],
    ['training_examples', trainingSheet.headers, trainingSheet.rows, 'mock_training_examples.csv'],
  ];

  // Use artifact-tool as the tabular authoring and verification surface.
  const workbook = Workbook.create();
  for (const [sheetName, headers, rows, fileName] of sheets) {
    const sheet = workbook.worksheets.add(sheetName);
    const matrix = [headers, ...rows];
    const range = sheet.getRangeByIndexes(0, 0, matrix.length, headers.length);
    range.values = matrix;
    sheet.freezePanes.freezeRows(1);
    // `range.values` already includes the header row; pass data rows only so
    // each CSV has exactly one header row.
    const csv = csvText(headers, range.values.slice(1));
    await fs.writeFile(path.join(OUTPUT_DIR, fileName), csv, 'utf8');
    const compact = await workbook.inspect({
      kind: 'table',
      sheetId: sheetName,
      range: `A1:${String.fromCharCode(65 + Math.min(headers.length - 1, 25))}${Math.min(matrix.length, 6)}`,
      include: 'values',
      tableMaxRows: 6,
      tableMaxCols: 8,
      maxChars: 2200,
    });
    console.log(`${fileName}: rows=${rows.length}, columns=${headers.length}`);
    console.log(compact.ndjson.split('\n').slice(0, 2).join('\n'));
  }

  const positives = trainingSheet.rows.filter((row) => row[12] === 1);
  const heldoutPositives = positives.filter((row) => row[5] === 'heldout');
  const users = new Set(trainingSheet.rows.map((row) => row[7]));
  if (users.size !== 2 || positives.length !== 1_500 || heldoutPositives.length !== 300) {
    throw new Error(`Unexpected training distribution: users=${users.size}, positives=${positives.length}, heldoutPositives=${heldoutPositives.length}`);
  }
  console.log(`training_examples: total=${trainingSheet.rows.length}, positives=${positives.length}, heldout_positives=${heldoutPositives.length}`);

  const previewDir = path.join(OUTPUT_DIR, '.previews');
  await fs.mkdir(previewDir, { recursive: true });
  for (const [sheetName] of sheets) {
    const range = sheetName === 'training_examples' ? 'A1:Z14' : 'A1:H14';
    const preview = await workbook.render({ sheetName, range, scale: 1, format: 'png' });
    await fs.writeFile(path.join(previewDir, `${sheetName}.png`), new Uint8Array(await preview.arrayBuffer()));
  }
  console.log(`previews: ${previewDir}`);
}

await main();
