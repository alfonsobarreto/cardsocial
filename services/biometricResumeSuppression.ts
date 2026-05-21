let biometricResumeSuppressionCount = 0;

export function beginBiometricResumeSuppression(): () => void {
  biometricResumeSuppressionCount += 1;
  let active = true;

  return () => {
    if (!active) return;
    active = false;
    biometricResumeSuppressionCount = Math.max(0, biometricResumeSuppressionCount - 1);
  };
}

export function isBiometricResumeSuppressed(): boolean {
  return biometricResumeSuppressionCount > 0;
}
