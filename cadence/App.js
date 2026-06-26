import 'react-native-gesture-handler';
import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { PlanProvider } from './src/context/PlanContext';
import AppNavigator from './src/navigation';

export default function App() {
  return (
    <SafeAreaProvider>
      <PlanProvider>
        <StatusBar style="light" />
        <AppNavigator />
      </PlanProvider>
    </SafeAreaProvider>
  );
}
