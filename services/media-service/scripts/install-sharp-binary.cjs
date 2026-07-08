// Docker build helper (#351): force sharp's platform-specific prebuilt binary
// to install deterministically.
//
// sharp ships its native `.node` and the matching `libvips-cpp.so` as
// *optional* dependencies (`@img/sharp-<platform>` + `@img/sharp-libvips-<platform>`).
// npm silently drops an optional dependency when its download hits a transient
// error and keeps going (npm/cli#4828), so `npm ci` intermittently produced a
// media-service image whose sharp crashed at boot with
//   ERR_DLOPEN_FAILED: Error loading shared library libvips-cpp.so.8.18.3
// even though the same Dockerfile built fine on most runs.
//
// Reinstalling those two packages as REQUIRED top-level installs makes npm fail
// the build (loudly, retryably) instead of skipping them, so an image only ever
// builds with a working sharp. The package names + versions are read from
// sharp's own `optionalDependencies`, so a Dependabot sharp bump needs no change
// here; libc + CPU are detected at build time so both x64 (CI) and arm64 (dev
// on Apple Silicon) resolve the right binary.
const { execSync } = require('node:child_process');
const path = require('node:path');

const sharpPkg = require(path.resolve('node_modules/sharp/package.json'));
const { familySync, MUSL } = require(path.resolve('node_modules/detect-libc'));

const libc = familySync() === MUSL ? 'linuxmusl' : 'linux';
const arch = process.arch; // 'x64' | 'arm64'

const specs = [`@img/sharp-${libc}-${arch}`, `@img/sharp-libvips-${libc}-${arch}`].map((name) => {
  const version = sharpPkg.optionalDependencies?.[name];
  if (!version) {
    throw new Error(`sharp has no pinned ${name} (arch=${arch}, libc=${libc}); cannot install its prebuilt binary`);
  }
  return `${name}@${version}`;
});

console.log(`Installing sharp prebuilt binary as required deps: ${specs.join(' ')}`);
execSync(`npm install --no-save ${specs.join(' ')}`, { stdio: 'inherit' });
