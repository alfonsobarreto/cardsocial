import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '@/services/firebaseConfig';

/**
 * Exporta el documento `users/{uid}` como JSON y abre el sheet de compartir (misma fuente que Ajustes).
 */
export async function shareExportedUserProfileJson(dialogTitle: string): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('No user');
  const userDoc = await getDoc(doc(db, 'users', uid));
  if (!userDoc.exists()) throw new Error('No data');
  const stringData = JSON.stringify(userDoc.data(), null, 2);
  const fileUri = (FileSystem.documentDirectory || '') + 'CardSocial_MisDatos.json';
  await FileSystem.writeAsStringAsync(fileUri, stringData);
  await Sharing.shareAsync(fileUri, { dialogTitle });
}
