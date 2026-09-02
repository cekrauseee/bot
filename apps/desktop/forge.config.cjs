const path = require('node:path')
const { FuseVersion, FuseV1Options } = require('@electron/fuses')

module.exports = {
  packagerConfig: {
    asar: true,
    appBundleId: 'eu.cekrause.mybot',
    osxSign: { identity: '-', identityValidation: false },
    prune: false,
    icon: path.resolve(__dirname, 'assets/icon'),
    // Electron Packager accepts source paths here (not electron-builder's
    // { from, to } objects). The directory basename becomes Resources/dist.
    extraResource: [
      path.resolve(__dirname, '../web/dist'),
      path.resolve(__dirname, 'assets/generated/public-config.json'),
    ],
  },
  plugins: [{
    name: '@electron-forge/plugin-fuses',
    config: {
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
      [FuseV1Options.GrantFileProtocolExtraPrivileges]: false,
    },
  }],
  makers: [
    { name: '@electron-forge/maker-squirrel', config: { name: 'myBot' } },
    { name: '@electron-forge/maker-zip', platforms: ['darwin', 'linux'] },
    { name: '@electron-forge/maker-dmg', config: { name: 'myBot' } },
  ],
}
