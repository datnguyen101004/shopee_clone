import { HomepageModules } from '../../components/homepage/homepage-modules';
import { HomepageEmptyState, HomepageErrorState } from '../../components/homepage/homepage-states';
import { fetchHomepage } from '../../lib/homepage-api';

export const dynamic = 'force-dynamic';

async function loadHomepage() {
  try {
    return await fetchHomepage();
  } catch {
    return null;
  }
}

export default async function HomePage() {
  const homepage = await loadHomepage();
  if (!homepage) return <HomepageErrorState />;
  return homepage.modules.length ? (
    <HomepageModules modules={homepage.modules} />
  ) : (
    <HomepageEmptyState />
  );
}
