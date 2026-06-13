import { useRouter } from 'expo-router';
import CsCreditPacksScreen from '@/components/CsCreditPacksScreen';

export default function VaultStoreScreen() {
  const router = useRouter();
  return <CsCreditPacksScreen onClose={() => router.back()} />;
}
