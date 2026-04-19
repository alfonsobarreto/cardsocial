import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';

interface HorizontalIdentityPanelProps {
  name: string;
  nickname: string;
  imageUri: string;
  stats: { users: number; stars: number };
}

const HorizontalIdentityPanel: React.FC<HorizontalIdentityPanelProps> = ({
  name,
  nickname,
  imageUri,
  stats,
}) => {
  return (
    <View style={styles.container}>
      <View style={styles.leftSection}>
        <Text style={styles.name}>{name}</Text>
        <Text style={styles.nickname}>{nickname}</Text>
        <Text style={styles.stats}># Usuarios: {stats.users}</Text>
        <Text style={styles.stats}>⭐⭐⭐⭐⭐</Text>
      </View>
      <Image source={{ uri: imageUri }} style={styles.profileImage} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 20,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  leftSection: {
    flex: 3,
    paddingRight: 10,
  },
  profileImage: {
    flex: 2,
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 2,
    borderColor: '#1EA7FF',
  },
  name: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#0A2540',
  },
  nickname: {
    fontSize: 14,
    color: '#4A4A4A',
    marginBottom: 10,
  },
  stats: {
    fontSize: 12,
    color: '#0A2540',
  },
});

export default HorizontalIdentityPanel;
