import styles from '../landing.module.css';

const items = [
  {
    title: 'Conexión Instantánea',
    body: 'NFC y QR: un toque o un escaneo y tu perfil está en sus manos, sin fricción.',
    icon: '⟲',
  },
  {
    title: 'El Vault Personal',
    body: 'Gestión en tiempo real: links, medios e identidad bajo control. Lo editas, el mundo ve la versión nueva.',
    icon: '◇',
  },
  {
    title: 'Diseño Exclusivo',
    body: 'Plantillas premium, tipografía cuidada y look & feel alineado con tarjetas físicas NFC.',
    icon: '◆',
  },
] as const;

export function ValuePropsSection() {
  return (
    <section className={styles.section} aria-labelledby="value-heading">
      <div className={styles.inner}>
        <p className={styles.label}>Propuesta de valor</p>
        <h2 className={styles.sectionTitle} id="value-heading">
          Software y presencia, alineados
        </h2>
        <p className={styles.sectionLead}>
          Una plataforma pensada para profesionales que cuidan el primer contacto — digital y en mano.
        </p>
        <div className={styles.valueGrid}>
          {items.map((it) => (
            <div key={it.title} className={styles.valueCard}>
              <div className={styles.valueIcon} aria-hidden>
                {it.icon}
              </div>
              <h3 className={styles.valueTitle}>{it.title}</h3>
              <p className={styles.valueText}>{it.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
