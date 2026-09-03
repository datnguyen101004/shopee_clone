import { FollowedShopsManagement } from '../../../../components/shop-storefront/followed-shops-management';
import { pickFollowedShopsQuery } from '../../../../lib/followed-shops-query';

type FollowedShopsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function FollowedShopsPage({ searchParams }: FollowedShopsPageProps) {
  let query = null;
  try {
    query = pickFollowedShopsQuery(await searchParams);
  } catch {
    // The client screen renders a safe reset path for invalid or repeated parameters.
  }
  return <FollowedShopsManagement query={query} />;
}
