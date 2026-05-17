import AsyncStorage from '@react-native-async-storage/async-storage';

import { ONBOARDING_STORAGE_KEY } from '@/constants/onboarding';

const DONE_VALUE = '1';

export async function readOnboardingDoneFromStorage(): Promise<boolean> {
  try {
    const v = await AsyncStorage.getItem(ONBOARDING_STORAGE_KEY);
    return v === DONE_VALUE;
  } catch {
    return false;
  }
}

export async function writeOnboardingDoneToStorage(): Promise<void> {
  await AsyncStorage.setItem(ONBOARDING_STORAGE_KEY, DONE_VALUE);
}
