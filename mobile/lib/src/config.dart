/// Compile-time configuration.
///
/// The gateway is the only public API entry (see docs/ARCHITECTURE.md); the
/// chat assistant is the one exception — it streams SSE through the web app
/// because the gateway buffers responses.
///
/// Override per flavor/device:
///   flutter run --dart-define=API_BASE_URL=http://192.168.1.10:4000 \
///               --dart-define=WEB_BASE_URL=http://192.168.1.10:3000
/// (Android emulators reach the host at 10.0.2.2.)
class AppConfig {
  static const gatewayBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://localhost:4000',
  );

  static const webBaseUrl = String.fromEnvironment(
    'WEB_BASE_URL',
    defaultValue: 'http://localhost:3000',
  );
}
