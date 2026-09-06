'use client';

import type { CampaignBannerDetail } from '@shopee-clone/contracts';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { fetchPublicCampaign } from '../lib/campaigns-api';
import { marketplaceMediaUrl } from '../lib/marketplace-media-url';
import { campaignRendererFor } from './campaign-renderer-registry';

function schedule(campaign: CampaignBannerDetail) {
  return `${new Date(campaign.startsAt).toLocaleString('vi-VN')} – ${new Date(campaign.endsAt).toLocaleString('vi-VN')}`;
}

function lifecycleLabel(value: CampaignBannerDetail['lifecycle']): string {
  return value === 'ACTIVE' ? 'Đang diễn ra' : value === 'ENDED' ? 'Đã kết thúc' : value === 'CANCELLED' ? 'Đã hủy' : value === 'ENROLLMENT_OPEN' ? 'Đang nhận đăng ký' : 'Sắp diễn ra';
}

export function CampaignDetailPage({ campaignId }: { campaignId: string }) {
  const [campaign, setCampaign] = useState<CampaignBannerDetail | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => { let active = true; void fetchPublicCampaign(campaignId).then((value) => active && setCampaign(value)).catch(() => active && setError(true)); return () => { active = false; }; }, [campaignId]);
  if (error) return <section className="operational-panel" role="alert"><h1>Chiến dịch không khả dụng</h1><p>Chiến dịch có thể đã kết thúc hoặc đang được cập nhật.</p><Link href="/">Về trang chủ</Link></section>;
  if (!campaign) return <section className="operational-panel" aria-live="polite"><span className="operational-eyebrow">Campaign</span><h1>Đang tải chiến dịch</h1><p>Đang lấy thông tin ưu đãi...</p></section>;
  const renderer = campaignRendererFor(campaign);
  return <article className={`campaign-detail ${renderer.className}`} data-campaign-type={renderer.key}>
    <header className="campaign-detail__hero">
      {campaign.imageUrl ? <img src={marketplaceMediaUrl(campaign.imageUrl)} alt={campaign.altText} /> : null}
      <div><span className="operational-eyebrow">{campaign.eyebrow ?? renderer.badge}</span><h1>{campaign.title}</h1>{campaign.description ? <p>{campaign.description}</p> : null}<p className="campaign-detail__schedule">{lifecycleLabel(campaign.lifecycle)} · {schedule(campaign)}</p></div>
    </header>
    <div className="campaign-detail__content">{campaign.content.map((block, index) => block.kind === 'heading' ? <h2 key={index}>{block.text}</h2> : block.kind === 'paragraph' ? <p key={index}>{block.text}</p> : block.kind === 'list' ? <ul key={index}>{block.items.map((item) => <li key={item}>{item}</li>)}</ul> : <Link key={index} href={block.href}>{block.label}</Link>)}</div>
    <section className="campaign-detail__products" aria-labelledby="campaign-products-title"><div className="campaign-detail__section-heading"><h2 id="campaign-products-title">Sản phẩm trong chiến dịch</h2><span>{campaign.products.length} sản phẩm</span></div>{campaign.products.length ? <div className="campaign-detail__product-grid">{campaign.products.map((product) => <Link href={product.href} key={product.id} className="campaign-detail__product"><img src={marketplaceMediaUrl(product.imageUrl)} alt="" /><strong>{product.name}</strong><span>{product.shopName}</span><b>₫{new Intl.NumberFormat('vi-VN').format(product.effectivePriceMinor)}</b><del>₫{new Intl.NumberFormat('vi-VN').format(product.basePriceMinor)}</del><small>Giảm {product.discountBasisPoints / 100}%</small></Link>)}</div> : <p>Hiện chưa có sản phẩm khả dụng.</p>}</section>
  </article>;
}
