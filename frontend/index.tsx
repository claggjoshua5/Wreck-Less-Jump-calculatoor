import { Redirect } from 'expo-router';

export default function Index() {
  // Redirects the app from the root straight into your main tabs
  return <Redirect href="/(tabs)" />;
}
