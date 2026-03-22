import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Text } from 'react-native';
import CardsScreen from '../screens/CardsScreen';
import CardDetailScreen from '../screens/CardDetailScreen';
import VaultScreen from '../screens/VaultScreen';
import ContactsScreen from '../screens/ContactsScreen';
import AdminScreen from '../screens/AdminScreen';
import { useAuth } from '../context/AuthContext';

const Tab = createBottomTabNavigator();
const CardsStack = createNativeStackNavigator();

const TabIcon = ({ label }) => <Text>{label}</Text>;

const CardsStackNavigator = () => (
  <CardsStack.Navigator>
    <CardsStack.Screen name="MyCards" component={CardsScreen} options={{ title: 'My Cards' }} />
    <CardsStack.Screen name="CardDetail" component={CardDetailScreen} options={{ title: 'Card' }} />
  </CardsStack.Navigator>
);

const MainNavigator = () => {
  const { user } = useAuth();
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: () => {
          const icons = { Cards: '🪪', Vault: '🔒', Contacts: '👥', Admin: '⚙️' };
          return <TabIcon label={icons[route.name] || '●'} />;
        },
        headerShown: false,
      })}
    >
      <Tab.Screen name="Cards" component={CardsStackNavigator} />
      <Tab.Screen name="Vault" component={VaultScreen} />
      <Tab.Screen name="Contacts" component={ContactsScreen} />
      {user?.role === 'admin' && <Tab.Screen name="Admin" component={AdminScreen} />}
    </Tab.Navigator>
  );
};

export default MainNavigator;
