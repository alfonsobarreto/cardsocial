import { Redirect, useGlobalSearchParams } from 'expo-router';

export default function Index() {
  const { code, campaignCode } = useGlobalSearchParams();

  if (code && typeof code === 'string') {
    return <Redirect href={{ pathname: '/redeem', params: { code } }} />;
  }

  if (campaignCode && typeof campaignCode === 'string') {
    return <Redirect href={{ pathname: '/redeem', params: { campaignCode } }} />;
  }

  return <Redirect href="/signin" />;
}