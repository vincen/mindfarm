/**
 * electron-builder `afterSign` hook.
 *
 * - With `-c.mac.identity=null` (local builds) electron-builder skips signing entirely,
 *   and macOS refuses to launch an unsigned bundle. An ad-hoc signature is applied so
 *   the produced app is runnable on the build machine.
 * - With a real Developer ID, the app is submitted to Apple for notarization as long as
 *   APPLE_ID / APPLE_APP_SPECIFIC_PASSWORD / APPLE_TEAM_ID are present.
 */
const { execFileSync } = require('node:child_process')
const { notarize } = require('@electron/notarize')

module.exports = async function afterSign(context) {
  if (context.electronPlatformName !== 'darwin') return

  const appPath = `${context.appOutDir}/${context.packager.appInfo.productFilename}.app`

  if (context.packager.platformSpecificBuildOptions.identity === null) {
    console.log('[after-sign] no identity configured, applying an ad-hoc signature.')
    execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], { stdio: 'inherit' })
    return
  }

  const { APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID } = process.env
  if (!APPLE_ID || !APPLE_APP_SPECIFIC_PASSWORD || !APPLE_TEAM_ID) {
    console.log('[after-sign] Apple credentials not set, skipping notarization.')
    return
  }

  console.log('[after-sign] submitting to Apple for notarization…')
  await notarize({
    appPath,
    appleId: APPLE_ID,
    appleIdPassword: APPLE_APP_SPECIFIC_PASSWORD,
    teamId: APPLE_TEAM_ID,
  })
  console.log('[after-sign] notarization complete.')
}
