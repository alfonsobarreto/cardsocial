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
        options={{ title: 'Admin', headerShown: false, animation: 'default' }}
      />
      <Stack.Screen
        name="stats"
        options={{ headerShown: false, animation: 'slide_from_right' }}
      />
      <Stack.Screen
        name="moderation"
        options={{ headerShown: false, animation: 'slide_from_right' }}
      />
      <Stack.Screen
        name="config"
        options={{ headerShown: false, animation: 'slide_from_right' }}
      />
    </Stack>
  );
}
