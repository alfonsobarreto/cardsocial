import { collection, getCountFromServer } from 'firebase/firestore';
import { db } from '../config/firebase';

export type DashboardStats = {
  usersCount: number;
  reportsCount: number;
};

export async function getDashboardStats(): Promise<DashboardStats> {
  const [usersSnapshot, reportsSnapshot] = await Promise.all([
    getCountFromServer(collection(db, 'users')),
    getCountFromServer(collection(db, 'reports')),
  ]);

  return {
    usersCount: usersSnapshot.data().count,
    reportsCount: reportsSnapshot.data().count,
  };
}
