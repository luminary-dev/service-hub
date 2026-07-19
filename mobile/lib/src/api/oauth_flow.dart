import 'package:flutter_web_auth_2/flutter_web_auth_2.dart';

import '../config.dart';
import 'api_client.dart';
import 'token_store.dart';

/// Social login (#398) for the mobile app. The web OAuth flow is cookie-based
/// (the callback sets `sh_session` and redirects), which a Bearer-only mobile
/// client can't consume. So the app runs the flow in a system web-auth session
/// pointed at the gateway's OAuth start with `client=mobile`; the backend, when
/// it sees that flag, mints access+refresh tokens and redirects to our custom
/// scheme `baaslk://auth?accessToken=…&refreshToken=…&expiresIn=…`, which this
/// captures. Requires OAuth credentials configured on the backend (same as the
/// web) AND the mobile-callback backend support — see docs/MOBILE.md.
class OAuthFlow {
  OAuthFlow(this.client);

  final ApiClient client;
  static const callbackScheme = 'baaslk';

  /// Runs the flow for [provider] (`google` | `facebook`). Returns null on
  /// success (tokens stored), or an error string.
  Future<String?> signIn(String provider) async {
    final startUrl =
        '${AppConfig.gatewayBaseUrl}/api/auth/oauth/$provider/start'
        '?client=mobile&redirect=$callbackScheme://auth';
    try {
      final result = await FlutterWebAuth2.authenticate(
        url: startUrl,
        callbackUrlScheme: callbackScheme,
      );
      final uri = Uri.parse(result);
      final error = uri.queryParameters['error'];
      if (error != null) return error;
      final access = uri.queryParameters['accessToken'];
      final refresh = uri.queryParameters['refreshToken'];
      if (access == null || refresh == null) return 'oauth';
      await client.tokenStore.write(
        StoredTokens(
          accessToken: access,
          refreshToken: refresh,
          accessExpiresAt: DateTime.now().add(Duration(
              seconds: int.tryParse(uri.queryParameters['expiresIn'] ?? '') ?? 900)),
        ),
      );
      return null;
    } catch (_) {
      // User cancelled the sheet, or the platform threw — treat as no-op.
      return 'cancelled';
    }
  }
}
