import Image from 'next/image';
import styles from '../landing.module.css';

const PLACEHOLDER_LOGO = '/images/placeholder-client-logo.png';

const sectors = [
  { label: 'Real Estate' },
  { label: 'Corporativo' },
  { label: 'Universidades' },
  { label: 'Austin' },
  { label: 'Eventos' },
];

export function SocialProofSection() {
  return (
    <section className={styles.social} aria-label="Confianza">
      <div className={styles.inner}>
        <div className={styles.socialRow}>
          <p className={styles.socialCaption}>Adopción en crecimiento</p>
          {sectors.map((s) => (
            <div key={s.label} className={styles.logoCell}>
              <div className={styles.logoSlot} title={s.label}>
                <Image
                  className={styles.logoImg}
                  src={PLACEHOLDER_LOGO}
                  alt=""
                  fill
                  sizes="100px"
                  style={{ objectFit: 'contain' }}
                />
              </div>
              <span className={styles.logoLabel}>{s.label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
