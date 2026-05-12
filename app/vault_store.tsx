import { useRouter } from 'expo-router';
import Subscription from '../components/Subscription';

export default function VaultStoreScreen() {
  const router = useRouter();
  return <Subscription onClose={() => router.back()} />;
}
