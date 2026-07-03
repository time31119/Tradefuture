import { Tabs } from 'expo-router';
import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FontAwesome6 } from '@expo/vector-icons';

export default function TabLayout() {
  const insets = useSafeAreaInsets();

  let tabBarStyle = {
    backgroundColor: '#0B0E14',
    borderTopWidth: 1,
    borderTopColor: '#2A2F3F',
    paddingBottom: insets.bottom > 0 ? insets.bottom - 8 : 8,
    paddingTop: 8,
    height: 64 + insets.bottom,
  };

  if (Platform.OS === 'web') {
    tabBarStyle = {
      ...tabBarStyle,
      height: 'auto' as any,
    };
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle,
        tabBarActiveTintColor: '#F5A623',
        tabBarInactiveTintColor: '#8896A6',
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '600',
          letterSpacing: 0.5,
          marginTop: 2,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: '首页',
          tabBarIcon: ({ color, focused }) => (
            <FontAwesome6
              name="chart-line"
              size={18}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="predict"
        options={{
          title: '预测',
          tabBarIcon: ({ color, focused }) => (
            <FontAwesome6
              name="bolt"
              size={18}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="node"
        options={{
          title: '节点',
          tabBarIcon: ({ color, focused }) => (
            <FontAwesome6
              name="cubes"
              size={18}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="swap"
        options={{
          title: '兑换',
          tabBarIcon: ({ color, focused }) => (
            <FontAwesome6
              name="arrows-rotate"
              size={18}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: '我的',
          tabBarIcon: ({ color, focused }) => (
            <FontAwesome6
              name="user"
              size={18}
              color={color}
            />
          ),
        }}
      />
    </Tabs>
  );
}
