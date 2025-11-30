const { FusesPlugin } = require('@electron-forge/plugin-fuses');
const { FuseV1Options, FuseVersion } = require('@electron/fuses');

module.exports = {
  packagerConfig: {
    asar: true,
    icon: './assets/icons/icon',
    name: 'Code Copier',        // This is the Human Readable Name (Title bar, Start Menu)
    executableName: 'code-copier', // <--- ADD THIS LINE (The actual file on disk)
  },
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      config: {},
    },
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin'],
    },
    {
      name: '@electron-forge/maker-deb',
      config: {
        options: {
          bin: 'code-copier', // Ensures the deb knows what binary to link
          name: 'code-copier',
          productName: 'Code Copier'
        }
      },
    },
    {
      name: '@electron-forge/maker-rpm',
      config: {
        options: {
          bin: 'code-copier',
          name: 'code-copier',
          productName: 'Code Copier'
        }
      },
    },
  ],
  plugins: [
    {
      name: '@electron-forge/plugin-auto-unpack-natives',
      config: {},
    },
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};