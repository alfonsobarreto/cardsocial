/**
 * Public NFC dynamic redirector.
 *
 * GET /n/:nfcCardId
 * No auth, no gateway key. The nfcCardId is an opaque public hardware id.
 */

const express = require('express');
const {
  chooseRedirectStatus,
  htmlPage,
  isExpired,
  normalizeNfcCardId,
} = require('../lib/nfcCards');

function createNfcPublicRoutes({ storage }) {
  const router = express.Router();

  router.get('/:nfcCardId', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    try {
      const nfcCardId = normalizeNfcCardId(req.params.nfcCardId);
      if (!nfcCardId) {
        return res.status(404).send(htmlPage({
          title: 'NFC no válida',
          body: 'Esta tarjeta Card-Social no pudo ser reconocida.',
        }));
      }

      const db = await storage.connect();
      const card = await db.collection('nfc_cards').findOne({ nfcCardId });
      if (!card) {
        return res.status(404).send(htmlPage({
          title: 'Tarjeta no vinculada',
          body: 'Esta tarjeta física todavía no está vinculada a una cuenta Card-Social.',
        }));
      }

      if (card.isClaimed !== true) {
        return res.status(200).send(htmlPage({
          title: 'Tarjeta sin activar',
          body: 'Esta tarjeta física todavía no ha sido vinculada por su dueño. Abre Card-Social para activarla con el PIN.',
        }));
      }

      const now = new Date();
      await db.collection('nfc_cards').updateOne(
        { nfcCardId },
        { $set: { lastResolvedAt: now } },
      ).catch(() => null);
      await db.collection('nfc_card_events').insertOne({
        nfcCardId,
        type: 'resolved',
        actorUid: null,
        createdAt: now,
        userAgent: String(req.headers['user-agent'] || '').slice(0, 500),
        ip: String(req.ip || req.socket?.remoteAddress || '').slice(0, 120),
      }).catch(() => null);

      const status = String(card.status || 'active');
      if (status === 'lost') {
        const contact = card.recoveryContact || null;
        const label = contact?.label ? String(contact.label) : 'canal elegido';
        const value = contact?.value ? String(contact.value) : '';
        const href = /^https?:\/\//i.test(value)
          ? value
          : value.includes('@')
            ? `mailto:${value}`
            : '';
        return res.status(200).send(htmlPage({
          title: 'Tarjeta perdida',
          body: `Esta Card-Social pertenece a ${String(card.label || 'su dueño')}. Si la encontraste, por favor contacta por ${label}.`,
          ctaLabel: href ? `Contactar por ${label}` : undefined,
          ctaHref: href || undefined,
        }));
      }

      if (status === 'paused') {
        return res.status(200).send(htmlPage({
          title: 'Tarjeta pausada',
          body: 'Esta tarjeta Card-Social está temporalmente desactivada por su dueño.',
        }));
      }

      if (status === 'blocked') {
        return res.status(200).send(htmlPage({
          title: 'Perfil no disponible',
          body: 'Esta tarjeta no está disponible en este momento.',
        }));
      }

      const mounted = card.mountedTarget || null;
      const fallback = card.fallbackTarget || null;
      let targetUrl = mounted?.publicUrl ? String(mounted.publicUrl) : '';
      let usedFallback = false;

      if (!targetUrl || isExpired(mounted, now)) {
        targetUrl = fallback?.publicUrl ? String(fallback.publicUrl) : '';
        usedFallback = true;
      }

      if (!/^https?:\/\//i.test(targetUrl)) {
        return res.status(200).send(htmlPage({
          title: 'Sin destino',
          body: 'Esta tarjeta física todavía no tiene una identidad montada.',
        }));
      }

      if (usedFallback) {
        await db.collection('nfc_card_events').insertOne({
          nfcCardId,
          type: 'fallback_used',
          actorUid: null,
          createdAt: new Date(),
          previousTarget: mounted || null,
          nextTarget: fallback || null,
        }).catch(() => null);
      }

      return res.redirect(chooseRedirectStatus(req), targetUrl);
    } catch (error) {
      console.error('[nfc-public]', error);
      return res.status(500).send(htmlPage({
        title: 'Card-Social',
        body: 'No pudimos resolver esta tarjeta en este momento. Intenta nuevamente.',
      }));
    }
  });

  return router;
}

module.exports = { createNfcPublicRoutes };
