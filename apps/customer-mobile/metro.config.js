const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

// ── Monorepo setup (spec §32) ──────────────────────────────────────────
// The app depends on @patafundi/shared from ../../packages/shared.
// Metro must watch the repo root and resolve modules from BOTH the app's
// node_modules and the workspace root's node_modules.
const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// Never bundle the shared package's own dev-time peer-dep copies — the app's
// react-native/expo copies carry the correct Flow transforms and versions.
config.resolver.blockList = [
  /packages[\\/]+shared[\\/]+node_modules[\\/].*/,
];

module.exports = config;
