import { Stack } from 'expo-router';

/**
 * Admin Routes Layout
 * 
 * Rutas protegidas exclusivas para super_admin (Pochobs)
 */

export default function AdminLayout() {
  return (
    <Stack>
      <Stack.Screen 
        name="dashboard" 
        options={{
          title: 'The Mint 👑',
          headerShown: false,
          animation: 'default',
        }} 
      />
    </Stack>
  );
}
