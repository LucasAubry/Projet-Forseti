import { StatusBar } from 'expo-status-bar';
import { SafeAreaView, StyleSheet } from 'react-native';

import { HomeScreen } from './src/screens/HomeScreen';

export default function App() {
  return (
    <SafeAreaView style={styles.container}>
      <HomeScreen />
      <StatusBar style="light" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#05070a',
  },
});
