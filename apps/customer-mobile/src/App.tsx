import React from 'react';
import { Text, View, StyleSheet } from 'react-native';

export default function App() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>PataFundi</Text>
      <Text style={styles.subtitle}>If you can see this, the app works!</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FBFAF8' },
  title: { fontSize: 34, fontWeight: 'bold', color: '#F97316' },
  subtitle: { fontSize: 16, color: '#78716C', marginTop: 8 },
});
