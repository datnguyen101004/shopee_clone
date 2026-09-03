import { readFile } from 'node:fs/promises';

const iconRoot = new URL('../docs/images/architecture/aws-icons/', import.meta.url);
const names = {
  amplify: 'Arch_AWS-Amplify_64.svg',
  cloudfront: 'Arch_Amazon-CloudFront_64.svg',
  s3: 'Arch_Amazon-Simple-Storage-Service_64.svg',
  ec2: 'Arch_Amazon-EC2_64.svg',
  rds: 'Arch_Amazon-RDS_64.svg',
  acm: 'Arch_AWS-Certificate-Manager_64.svg',
  ssm: 'Arch_AWS-Systems-Manager_64.svg',
  alb: 'Res_Elastic-Load-Balancing_Application-Load-Balancer_48.svg',
  nat: 'Res_Amazon-VPC_NAT-Gateway_48.svg',
  igw: 'Res_Amazon-VPC_Internet-Gateway_48.svg',
  role: 'Res_AWS-Identity-Access-Management_Role_48.svg',
  user: 'Res_User_48_Light.svg',
  vpc: 'Virtual-private-cloud-VPC_32.svg',
  cloud: 'AWS-Cloud-logo_32.svg',
};
const palette = { api: '#2864bf', media: '#24794c', ops: '#b56315', config: '#ad3564' };
const escape = (value) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;');

export async function awsDeploymentDiagram() {
  const icons = Object.fromEntries(
    await Promise.all(
      Object.entries(names).map(async ([key, file]) => [
        key,
        (await readFile(new URL(file, iconRoot))).toString('base64'),
      ]),
    ),
  );
  const t = (x, y, value, size = 20, color = '#263449', weight = 400, anchor = 'start') =>
    `<text x="${x}" y="${y}" text-anchor="${anchor}" font-size="${size}" fill="${color}" font-weight="${weight}">${escape(value)}</text>`;
  const icon = (key, x, y, size = 64) =>
    `<image x="${x}" y="${y}" width="${size}" height="${size}" href="data:image/svg+xml;base64,${icons[key]}"/>`;
  const node = (key, cx, top, titles, lines = []) =>
    `${icon(key, cx - 32, top)}${titles.map((line, i) => t(cx, top + 89 + i * 24, line, 21, '#263449', 650, 'middle')).join('')}${lines.map((line, i) => t(cx, top + 91 + titles.length * 24 + i * 22, line, 17, '#536175', 400, 'middle')).join('')}`;
  const line = (d, kind = 'api', dashed = false) =>
    `<path d="${d}" fill="none" stroke="${palette[kind]}" stroke-width="2.6" stroke-linejoin="round" marker-end="url(#${kind})"${dashed ? ' stroke-dasharray="8 6"' : ''}/>`;
  const label = (x, y, value, kind = 'api', anchor = 'middle') =>
    `<text x="${x}" y="${y}" text-anchor="${anchor}" font-size="18" font-weight="600" fill="${palette[kind]}" stroke="#fff" stroke-width="7" stroke-linejoin="round" paint-order="stroke">${escape(value)}</text>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1800" height="1230" viewBox="0 0 1800 1230" role="img" aria-labelledby="title desc">
<title id="title">Shopee Clone — AWS deployment architecture</title>
<desc id="desc">Frontend on Amplify calls an ACM-protected Application Load Balancer, which routes to EC2 in a private subnet. Frontend retrieves media through CloudFront and a private S3 origin. EC2 uses its IAM role to call S3 and connects to RDS PostgreSQL. SSM Agent initiates outbound HTTPS through NAT Gateway and Internet Gateway to Systems Manager. The operator opens a Session Manager or SSH-over-SSM session.</desc>
<defs>${Object.entries(palette)
    .map(
      ([key, color]) =>
        `<marker id="${key}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto"><path d="M0 0 L10 5 L0 10z" fill="${color}"/></marker>`,
    )
    .join('')}</defs>
<rect width="1800" height="1230" fill="#fff"/>
<g font-family="Segoe UI, Arial, sans-serif">
${t(40, 57, 'Shopee Clone · Kiến trúc triển khai AWS', 36, '#17263b', 700)}
${t(40, 96, 'Amplify · ALB + ACM · EC2 · RDS PostgreSQL · CloudFront / S3 · Session Manager qua NAT', 22, '#5a687c')}

<rect x="225" y="145" width="1530" height="900" rx="4" fill="#fff" stroke="#7a8797" stroke-width="2"/>
${icon('cloud', 242, 157, 36)}${t(290, 184, 'AWS Cloud', 23, '#263449', 650)}
<rect x="305" y="408" width="1100" height="574" rx="4" fill="#fff" stroke="#7c54b6" stroke-width="2"/>
${icon('vpc', 319, 416, 30)}${t(360, 439, 'Amazon VPC · ap-southeast-1', 22, '#7145a7', 650)}
<rect x="335" y="462" width="450" height="488" rx="3" fill="#f4f8eb" stroke="#8ba94c" stroke-width="1.5"/>
${t(352, 491, 'Public subnets', 19, '#5b772d', 650)}
<rect x="845" y="462" width="530" height="350" rx="3" fill="#eef7fb" stroke="#62a9bb" stroke-width="1.5"/>
${t(863, 491, 'Private subnets', 19, '#367d90', 650)}

${line('M155 235 H337')}
${line('M375 335 V390 H290 V625 H430')}
${label(462, 380, '1 · Frontend gọi API · HTTPS 443')}
${line('M418 262 H480 V205 H1200 V213', 'media')}
${label(825, 195, '2 · Đọc ảnh qua CDN · HTTPS', 'media')}
${line('M1270 262 H1508', 'media')}
${label(1385, 244, 'S3 origin / OAC', 'media')}
${line('M512 625 H880')}
${label(696, 608, 'Target group → EC2')}
${t(696, 650, 'Routing + health check', 17, '#536175', 400, 'middle')}
${line('M682 335 V370 H807 V540 H478 V573', 'config', true)}
${label(552, 525, 'Chứng chỉ TLS', 'config')}
${line('M1187 537 H1144 V568', 'config', true)}
${line('M1010 535 V380 H1690 V260 H1598', 'media')}
${label(1320, 369, '3 · S3 API · quyền từ IAM role', 'media')}
${line('M1010 708 V722 H1228')}
${label(1113, 752, 'PostgreSQL')}
${line('M917 708 V785 H478 V833', 'ops')}
${label(659, 773, '4 · SSM Agent khởi tạo kết nối', 'ops')}
${line('M518 866 H1268', 'ops')}
${label(890, 853, 'Outbound HTTPS 443', 'ops')}
${line('M1335 866 H1554', 'ops')}
${label(1445, 848, 'Public endpoint', 'ops')}
${line('M155 883 H205 V1010 H1720 V865 H1626', 'ops')}
${label(905, 1001, '5 · Quản trị viên mở Session Manager / SSH over SSM', 'ops')}

${node('user', 115, 205, ['Người dùng'], ['Buyer / Seller / Admin'])}
${node('amplify', 375, 219, ['AWS Amplify'], ['Frontend Next.js'])}
${node('cloudfront', 1200, 219, ['Amazon CloudFront'], ['CDN phân phối media'])}
${node('s3', 1560, 219, ['Amazon S3'], ['Private bucket'])}
${node('acm', 682, 219, ['AWS ACM'], ['Certificate Manager'])}
${node('alb', 478, 579, ['Application Load', 'Balancer (ALB)'], ['HTTPS listener :443'])}
<rect x="880" y="535" width="264" height="173" rx="6" fill="#fff" stroke="#c7d7e2" stroke-width="1.5"/>
${icon('ec2', 898, 552)}${t(978, 574, 'Amazon EC2', 23, '#263449', 700)}
${t(978, 603, 'Docker Compose', 18, '#536175')}
${t(898, 645, 'NestJS API + Elasticsearch', 18, '#263449', 550)}
${t(898, 675, 'Worker · migrator · SSM Agent', 17, '#536175')}
${node('role', 1220, 508, ['IAM role'], ['EC2 instance profile', 'Quyền S3 + SSM'])}
${node('rds', 1270, 673, ['Amazon RDS'], ['PostgreSQL'])}
${node('nat', 478, 833, ['NAT Gateway'])}
${node('igw', 1300, 833, ['Internet Gateway'])}
${node('ssm', 1587, 833, ['AWS Systems Manager'], ['Session Manager'])}
${node('user', 115, 850, ['Quản trị viên'])}

${t(40, 1102, 'CHÚ GIẢI', 17, '#536175', 700)}
${line('M170 1096 H222')}${t(237, 1102, 'API / database', 18)}
${line('M435 1096 H487', 'media')}${t(502, 1102, 'Media / S3', 18)}
${line('M690 1096 H742', 'ops')}${t(757, 1102, 'Quản trị / outbound SSM', 18)}
${line('M1108 1096 H1160', 'config', true)}${t(1175, 1102, 'Gắn chứng chỉ / cấp quyền', 18)}
${t(40, 1151, 'Mũi tên chỉ chiều khởi tạo request; dữ liệu phản hồi đi ngược chiều. IAM role là cơ chế cấp quyền cho EC2, không phải một hop mạng.', 19, '#536175')}
${t(40, 1183, 'Sơ đồ gom các subnet theo chức năng, không biểu diễn số AZ/instance. Luồng EC2 → S3 thể hiện quyền truy cập logic.', 18, '#536175')}
${t(40, 1213, 'AWS Architecture Icons · bộ chính thức 31/07/2026 · Kiến trúc do chủ dự án xác nhận.', 16, '#738095')}
</g></svg>`;
}
