import { Tabs } from 'expo-router';
import { StyleSheet, Text, type ColorValue } from 'react-native';
import { palette } from '@/components/AppScreen';
import {useAppTheme} from '@/lib/theme';

const icon = (value: string, color: ColorValue) => <Text style={[styles.icon, { color }]}>{value}</Text>;

export default function TabLayout() {
  const {isDark}=useAppTheme();return <Tabs screenOptions={{headerShown:false,tabBarActiveTintColor:isDark?'#93C5FD':palette.primary,tabBarInactiveTintColor:isDark?'#CBD5E1':'#667085',tabBarStyle:[styles.bar,isDark&&styles.barDark],tabBarLabelStyle:styles.label}}>
    <Tabs.Screen name="index" options={{ title: 'Hoy', tabBarIcon: ({ color }) => icon('●', color) }} />
    <Tabs.Screen name="calendar" options={{ title: 'Agenda', tabBarIcon: ({ color }) => icon('▦', color) }} />
    <Tabs.Screen name="finances" options={{ title: 'Gastos', tabBarIcon: ({ color }) => icon('$', color) }} />
    <Tabs.Screen name="reports" options={{ title: 'Informes', tabBarIcon: ({ color }) => icon('▥', color) }} />
    <Tabs.Screen name="settings" options={{ title: 'Ajustes', tabBarIcon: ({ color }) => icon('⚙', color) }} />
  </Tabs>;
}

const styles = StyleSheet.create({bar:{height:72,paddingTop:7,paddingBottom:9,borderTopColor:'#E5E7EB',backgroundColor:'#FFFFFF'},barDark:{backgroundColor:'#172033',borderTopColor:'#475569'},label:{fontSize:11,fontWeight:'700'},icon:{fontSize:21,fontWeight:'800'}});
