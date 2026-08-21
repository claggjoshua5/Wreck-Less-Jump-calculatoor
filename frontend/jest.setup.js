// Jest setup file
jest.mock('expo-font');
jest.mock('expo-splash-screen');
jest.mock('expo-constants');

// Mock Expo Router
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: jest.fn(),
    back: jest.fn(),
    replace: jest.fn(),
  }),
  Stack: () => null,
  Tabs: () => null,
  usePathname: () => '/',
}));

// Mock async storage
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
}));
