import { DM_Sans, Playfair_Display } from 'next/font/google';
import styles from './landing.module.css';
import { HardwareSection } from './sections/HardwareSection';
import { HeroSection } from './sections/HeroSection';
import { LandingFooter } from './sections/LandingFooter';
import { PricingSection } from './sections/PricingSection';
import { SocialProofSection } from './sections/SocialProofSection';
import { ValuePropsSection } from './sections/ValuePropsSection';

const playfair = Playfair_Display({
  subsets: ['latin'],
  variable: '--font-playfair',
  display: 'swap',
});

const dmSans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-dm',
  display: 'swap',
});

export default function LandingPage() {
  return (
    <div className={`${playfair.variable} ${dmSans.variable} ${styles.root}`}>
      <HeroSection />
      <SocialProofSection />
      <ValuePropsSection />
      <HardwareSection />
      <PricingSection />
      <LandingFooter />
    </div>
  );
}
