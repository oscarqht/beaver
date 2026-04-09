import { HomePageClient } from '../components/HomePageClient';
import { clientProviderCatalog } from '../lib/provider-config';

export default function HomePage() {
  return <HomePageClient providers={clientProviderCatalog} />;
}
