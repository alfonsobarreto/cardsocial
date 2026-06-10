/**
 * En Windows (y algunos ISPs) el resolver DNS del sistema responde a `nslookup`
 * pero Node falla con `querySrv ECONNREFUSED` al usar `mongodb+srv://`.
 * Fijamos DNS públicos antes de que el driver Mongo resuelva SRV.
 *
 * Opt-out: `MONGO_DNS_SERVERS=off` o `0`.
 */

function bootstrapMongoDns() {
  try {
    const dns = require('dns');
    const raw = String(process.env.MONGO_DNS_SERVERS ?? '8.8.8.8,1.1.1.1').trim();
    const disabled =
      !raw || raw === '0' || raw === 'off' || raw === 'false' || raw === 'no' || raw === 'system';
    if (!disabled) {
      const servers = raw
        .split(/[,;\s]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      if (servers.length) {
        dns.setServers(servers);
      }
    }
    if (typeof dns.setDefaultResultOrder === 'function') {
      dns.setDefaultResultOrder('ipv4first');
    }
  } catch {
    /* no bloquear arranque */
  }
}

module.exports = { bootstrapMongoDns };
