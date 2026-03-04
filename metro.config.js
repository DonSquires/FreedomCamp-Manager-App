const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Exclude expo-sqlite from web bundles (mobile-only APK)
config.resolver.resolverMainFields = ['react-native', 'browser', 'main'];
config.resolver.platforms = ['ios', 'android'];

// Ignore expo-sqlite web worker files
config.resolver.blockList = [
  /node_modules\/expo-sqlite\/web\//,
];

module.exports = config;
