import { collection, getCountFromServer } from 'firebase/firestore';
import { db } from '../config/firebase';

export type DashboardStats = {
  usersCount: number;
  reportsCount: number;
};

export async function getDashboardStats(): Promise<DashboardStats> {
  const [usersSnapshot, reportsSnapshot, legacyReportsSnapshot] = await Promise.all([
    getCountFromServer(collection(db, 'users')),
    getCountFromServer(collection(db, 'reports')),
    getCountFromServer(collection(db, 'userReports')).catch(() => null),
  ]);

  return {
    usersCount: usersSnapshot.data().count,
    reportsCount:
      reportsSnapshot.data().count + (legacyReportsSnapshot?.data().count ?? 0),
  };
}
