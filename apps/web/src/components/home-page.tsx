import { HomePage as HomePageBase, type HomePageProps } from "#/features/home/ui/home-page";
import { PoolsPage } from "#/features/pools/ui";

export function HomePage(props: HomePageProps) {
  return <HomePageBase {...props} poolsPage={<PoolsPage />} />;
}
