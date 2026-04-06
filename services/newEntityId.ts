import 'react-native-get-random-values';
import { v4 as uuidv4 } from 'uuid';

/**
 * RFC 4122 UUID v4 for new smart cards, vault rows, business cards, etc.
 * Legacy timestamp/random IDs remain valid as opaque strings; do not migrate.
 */
export function newEntityId(): string {
  return uuidv4();
}
