const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Keep gif/mp4 explicitly in assets to avoid custom-config regressions.
config.resolver.assetExts = Array.from(
  new Set([...(config.resolver.assetExts || []), 'gif', 'mp4'])
);

module.exports = config;
