import { Redirect, useGlobalSearchParams } from 'expo-router';

export default function Index() {
  const { code } = useGlobalSearchParams();

  if (code && typeof code === 'string') {
    return <Redirect href={{ pathname: '/redeem', params: { code } }} />;
  }

  return <Redirect href="/signin" />;
}