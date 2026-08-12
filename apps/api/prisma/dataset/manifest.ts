import type { DatasetManifestEntry } from './types';

export const DATASET_POLICY_VERSION = 'dataset-v1';
export const CANONICAL_DATASET_RECORD_COUNT = 1_377;

export const canonicalDatasetManifest = [
  {
    key: 'bachhoa',
    fileName: 'bachhoa.json',
    expectedCount: 51,
    category: { slug: 'bach-hoa', name: 'Bách hóa', iconKey: 'grocery', sortOrder: 10 },
    shop: {
      slug: 'bach-hoa-xanh-dataset',
      name: 'Bách Hóa Xanh',
      location: 'TP. Hồ Chí Minh',
    },
  },
  {
    key: 'dienthoai',
    fileName: 'dienthoai.json',
    expectedCount: 93,
    category: { slug: 'dien-thoai', name: 'Điện thoại', iconKey: 'phone', sortOrder: 20 },
    shop: {
      slug: 'dien-thoai-hay-dataset',
      name: 'Điện Thoại Hay',
      location: 'Hà Nội',
    },
  },
  {
    key: 'mypham',
    fileName: 'mypham.json',
    expectedCount: 300,
    category: { slug: 'my-pham', name: 'Mỹ phẩm', iconKey: 'beauty', sortOrder: 30 },
    shop: {
      slug: 'linh-cosmetics-dataset',
      name: 'Linh Cosmetics',
      location: 'TP. Hồ Chí Minh',
    },
  },
  {
    key: 'noithat',
    fileName: 'noithat.json',
    expectedCount: 300,
    category: { slug: 'noi-that', name: 'Nội thất', iconKey: 'home', sortOrder: 40 },
    shop: {
      slug: 'space-t-dataset',
      name: 'Space T',
      location: 'TP. Hồ Chí Minh',
    },
  },
  {
    key: 'thethao',
    fileName: 'thethao.json',
    expectedCount: 294,
    category: { slug: 'the-thao', name: 'Thể thao', iconKey: 'sport', sortOrder: 50 },
    shop: { slug: 'myshoes-dataset', name: 'MyShoes', location: 'Hà Nội' },
  },
  {
    key: 'thoitrang',
    fileName: 'thoitrang.json',
    expectedCount: 339,
    category: { slug: 'thoi-trang', name: 'Thời trang', iconKey: 'fashion', sortOrder: 60 },
    shop: {
      slug: 'icon-denim-dataset',
      name: 'ICON DENIM',
      location: 'TP. Hồ Chí Minh',
    },
  },
] as const satisfies readonly DatasetManifestEntry[];
