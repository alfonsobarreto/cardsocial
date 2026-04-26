import Image from 'next/image';
import Link from 'next/link';
import styles from '../landing.module.css';

export function HeroSection() {
  return (
    <section className={styles.hero} aria-label="Inicio">
      <div className={styles.inner}>
        <div className={styles.heroGrid}>
          <div>
            <h1 className={styles.heroTitle}>Tu Identidad Digital, Elevada</h1>
            <p className={styles.heroSubtitle}>
              Networking premium sin contacto: un tap, un QR o una tarjeta física. Identidad mínima en superficie, máxima
              en profundidad.
            </p>
            <Link className={styles.ctaPrimary} href="/login">
              Crea tu perfil gratis
            </Link>
          </div>
          <div className={styles.mockupWrap} aria-hidden>
            <div className={styles.mockupPhone}>
              <span className={styles.mockupFrame} />
              <Image
                className={styles.mockupImg}
                src="/images/placeholder-mockup-phone.png"
                alt=""
                width={200}
                height={400}
                priority
                sizes="(max-width: 1024px) 38vw, 200px"
              />
            </div>
            <div className={styles.mockupCard}>
              <span className={styles.mockupFrame} />
              <Image
                className={styles.mockupImg}
                src="/images/placeholder-mockup-card.png"
                alt=""
                width={180}
                height={114}
                priority
                sizes="(max-width: 1024px) 35vw, 180px"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
