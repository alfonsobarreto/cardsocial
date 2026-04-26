import Image from 'next/image';
import Link from 'next/link';
import styles from '../landing.module.css';

const materials = [
  {
    name: 'Plástico mate',
    body: 'Resistente, ligero y con acabado sobrio. Ideal para volumen y reemplazo frecuente.',
    image: '/images/placeholder-hardware-plastic.png',
  },
  {
    name: 'Madera',
    body: 'Calidez y tacto orgánico. Cada pieza reforzada con NFC integrado, lista para el bolsillo de tarjeta.',
    image: '/images/placeholder-hardware-wood.png',
  },
  {
    name: 'Metal',
    body: 'Peso y brillo: statement físico. Grabado o estampado en línea con tu identidad de marca.',
    image: '/images/placeholder-hardware-metal.png',
  },
] as const;

export function HardwareSection() {
  return (
    <section className={styles.hardware} id="hardware" aria-labelledby="hardware-heading">
      <div className={styles.inner}>
        <p className={styles.label}>Presencia física</p>
        <h2 className={styles.sectionTitle} id="hardware-heading">
          Tarjetas NFC que se sienten premium
        </h2>
        <p className={styles.sectionLead}>
          El mismo perfil, materializado. Elige el nivel de presencia: discreto, cálido o contundente.
        </p>
        <div className={styles.hwGrid}>
          {materials.map((m) => (
            <article key={m.name} className={styles.hwCard}>
              <div className={styles.hwImgWrap}>
                <Image
                  className={styles.mockupImg}
                  src={m.image}
                  alt=""
                  width={320}
                  height={240}
                  sizes="(max-width: 640px) 100vw, 33vw"
                />
              </div>
              <h3 className={styles.hwName}>{m.name}</h3>
              <p className={styles.hwDesc}>{m.body}</p>
            </article>
          ))}
        </div>
        <div className={styles.hwCta} style={{ textAlign: 'center' }}>
          <Link className={styles.ctaSecondary} href="/login?ref=coleccion">
            Explorar colección
          </Link>
        </div>
        <p className={styles.disclaimer} style={{ textAlign: 'center', marginTop: '1.5rem' }}>
          Catálogo y stock según región. Los pedidos de hardware se alinean a tu plan y disponibilidad operativa.
        </p>
      </div>
    </section>
  );
}
