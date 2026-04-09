import { HomePageClient } from '../components/HomePageClient';
import { clientProviderCatalog } from '../lib/provider-config';
import { getRecentRepoPaths } from '../lib/store';

export default async function HomePage() {
  const recentRepoPaths = await getRecentRepoPaths();
  return <HomePageClient providers={clientProviderCatalog} recentRepoPaths={recentRepoPaths} />;
}
