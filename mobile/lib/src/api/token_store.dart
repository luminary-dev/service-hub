import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// The mobile session: a short-lived access JWT plus a long-lived refresh
/// token (#797). Persisted in the platform keychain/keystore — never in
/// plain prefs.
class StoredTokens {
  const StoredTokens({
    required this.accessToken,
    required this.refreshToken,
    required this.accessExpiresAt,
  });

  final String accessToken;
  final String refreshToken;
  final DateTime accessExpiresAt;

  /// Refresh slightly early so a request never leaves with a token that
  /// expires in flight.
  bool get accessExpired =>
      DateTime.now().isAfter(accessExpiresAt.subtract(const Duration(seconds: 30)));

  Map<String, dynamic> toJson() => {
        'accessToken': accessToken,
        'refreshToken': refreshToken,
        'accessExpiresAt': accessExpiresAt.toIso8601String(),
      };

  static StoredTokens? fromJson(Map<String, dynamic> json) {
    final access = json['accessToken'];
    final refresh = json['refreshToken'];
    final expires = DateTime.tryParse(json['accessExpiresAt'] as String? ?? '');
    if (access is! String || refresh is! String || expires == null) return null;
    return StoredTokens(
      accessToken: access,
      refreshToken: refresh,
      accessExpiresAt: expires,
    );
  }
}

class TokenStore {
  TokenStore([FlutterSecureStorage? storage])
      : _storage = storage ?? const FlutterSecureStorage();

  static const _key = 'baas_session_tokens';
  final FlutterSecureStorage _storage;
  StoredTokens? _cached;
  bool _loaded = false;

  Future<StoredTokens?> read() async {
    if (_loaded) return _cached;
    final raw = await _storage.read(key: _key);
    if (raw != null) {
      try {
        _cached = StoredTokens.fromJson(jsonDecode(raw) as Map<String, dynamic>);
      } catch (_) {
        _cached = null;
      }
    }
    _loaded = true;
    return _cached;
  }

  Future<void> write(StoredTokens tokens) async {
    _cached = tokens;
    _loaded = true;
    await _storage.write(key: _key, value: jsonEncode(tokens.toJson()));
  }

  Future<void> clear() async {
    _cached = null;
    _loaded = true;
    await _storage.delete(key: _key);
  }
}
