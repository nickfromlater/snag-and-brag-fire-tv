const path = require('node:path');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');
const workspace = path.resolve(__dirname, '..');
module.exports = mergeConfig(getDefaultConfig(__dirname), {
  watchFolders: [workspace],
  resolver: {
    unstable_enableSymlinks: true,
    resolveRequest(context, name, platform) {
      const aliases = {'react-native':'@amazon-devices/react-native-kepler','react-native-svg':'@amazon-devices/react-native-svg','expo-font':'@amazon-devices/expo-font','expo-asset':'@amazon-devices/expo-asset','expo-constants':'@amazon-devices/expo-constants'};
      const alias = Object.keys(aliases).find(key => name === key || name.startsWith(key + '/'));
      if (alias) return context.resolveRequest(context, aliases[alias] + name.slice(alias.length), platform);
      return context.resolveRequest(context, name, platform);
    },
    unstable_enablePackageExports: true,
    nodeModulesPaths: [path.join(__dirname, 'node_modules'), path.join(workspace, 'node_modules')],
    extraNodeModules: { '@snag/shared': path.join(workspace, 'shared') },
  },
});
