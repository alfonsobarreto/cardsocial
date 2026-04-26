import type { ComponentType } from 'react';
import {
  IconAgencias,
  IconEducacion,
  IconGastronomia,
  IconRealEstate,
  IconStartups,
} from '../IndustryIcons';
import styles from '../landing.module.css';

const industries: { label: string; Icon: ComponentType<{ className?: string; title: string }> }[] = [
  { label: 'Real Estate', Icon: IconRealEstate },
  { label: 'Gastronomía', Icon: IconGastronomia },
  { label: 'Agencias', Icon: IconAgencias },
  { label: 'Startups', Icon: IconStartups },
  { label: 'Educación', Icon: IconEducacion },
];

export function SocialProofSection() {
  return (
    <section className={styles.social} aria-label="Sectores">
      <div className={styles.inner}>
        <div className={styles.socialRow}>
          <p className={styles.socialCaption}>Presencia en sectores</p>
          {industries.map(({ label, Icon }) => (
            <div key={label} className={styles.industryCell}>
              <div className={styles.industryIconWrap} title={label}>
                <Icon className={styles.industrySvg} title={label} />
              </div>
              <span className={styles.industryLabel}>{label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
