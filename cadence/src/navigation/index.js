import React from 'react';
import { Text } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, SPACING } from '../theme';
import DashboardScreen from '../screens/DashboardScreen';
import TimelineScreen  from '../screens/TimelineScreen';
import ItemsScreen     from '../screens/ItemsScreen';
import SettingsScreen  from '../screens/SettingsScreen';

const Tab = createBottomTabNavigator();

// SVG-free icons as unicode symbols — no extra dependency
const ICONS = {
  Home:     { active: '◉', inactive: '○' },
  Timeline: { active: '▤', inactive: '▥' },
  Items:    { active: '≡', inactive: '≡' },
  Settings: { active: '⊙', inactive: '⊙' },
};

function TabIcon({ name, focused }) {
  return (
    <Text style={{ fontSize: 20, color: focused ? C.gold : C.textMuted }}>
      {focused ? ICONS[name].active : ICONS[name].inactive}
    </Text>
  );
}

function TabLabel({ children, focused }) {
  return (
    <Text style={{
      fontSize: 9,
      fontWeight: '700',
      letterSpacing: 0.8,
      textTransform: 'uppercase',
      color: focused ? C.gold : C.textMuted,
      marginBottom: 3,
    }}>
      {children}
    </Text>
  );
}

export default function AppNavigator() {
  const insets = useSafeAreaInsets();

  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={{
          headerShown: false,
          tabBarStyle: {
            backgroundColor: C.tabBg,
            borderTopWidth: 1,
            borderTopColor: C.border,
            height: 52 + insets.bottom,
            paddingTop: 6,
          },
          tabBarActiveTintColor: C.gold,
          tabBarInactiveTintColor: C.textMuted,
        }}
      >
        <Tab.Screen
          name="Home"
          component={DashboardScreen}
          options={{
            tabBarIcon: ({ focused }) => <TabIcon name="Home" focused={focused} />,
            tabBarLabel: ({ focused }) => <TabLabel focused={focused}>Home</TabLabel>,
          }}
        />
        <Tab.Screen
          name="Timeline"
          component={TimelineScreen}
          options={{
            tabBarIcon: ({ focused }) => <TabIcon name="Timeline" focused={focused} />,
            tabBarLabel: ({ focused }) => <TabLabel focused={focused}>Timeline</TabLabel>,
          }}
        />
        <Tab.Screen
          name="Items"
          component={ItemsScreen}
          options={{
            tabBarIcon: ({ focused }) => <TabIcon name="Items" focused={focused} />,
            tabBarLabel: ({ focused }) => <TabLabel focused={focused}>Items</TabLabel>,
          }}
        />
        <Tab.Screen
          name="Settings"
          component={SettingsScreen}
          options={{
            tabBarIcon: ({ focused }) => <TabIcon name="Settings" focused={focused} />,
            tabBarLabel: ({ focused }) => <TabLabel focused={focused}>Settings</TabLabel>,
          }}
        />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
