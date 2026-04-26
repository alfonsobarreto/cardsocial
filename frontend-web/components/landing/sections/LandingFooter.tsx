import Link from 'next/link';
import styles from '../landing.module.css';

const links = [
  { href: '/legal/terminos', label: 'Términos' },
  { href: '/legal/privacidad', label: 'Privacidad' },
  { href: '/admin', label: 'Admin' },
] as const;

export function LandingFooter() {
  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <div className={styles.footerRow}>
          <div>
            <p className={styles.brand}>Card-Social</p>
            <p className={styles.footerNote}>Identidad digital y tarjetas NFC · {new Date().getFullYear()}</p>
          </div>
          <nav className={styles.footerLinks} aria-label="Footer">
            {links.map((l) => (
              <Link key={l.href} className={styles.footerLink} href={l.href}>
                {l.label}
              </Link>
            ))}
          </nav>
        </div>
      </div>
    </footer>
  );
}
