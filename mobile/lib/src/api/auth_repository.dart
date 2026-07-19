import 'package:dio/dio.dart';

import '../models/models.dart';
import 'api_client.dart';
import 'token_store.dart';

class AuthResult {
  const AuthResult.success(this.user) : error = null;
  const AuthResult.failure(this.error) : user = null;

  final UserAccount? user;
  final String? error;

  bool get ok => error == null;
}

class AuthRepository {
  AuthRepository(this.client);

  final ApiClient client;

  /// Password login via the mobile token endpoint (#797). Stores the token
  /// pair; the interceptor takes it from there.
  Future<AuthResult> login(String email, String password) async {
    final res = await client.dio.post(
      '/api/auth/token',
      data: {'email': email, 'password': password, 'deviceName': 'mobile'},
    );
    if (res.statusCode == 200 && res.data is Map) {
      final data = res.data as Map;
      await client.tokenStore.write(
        StoredTokens(
          accessToken: data['accessToken'] as String,
          refreshToken: data['refreshToken'] as String,
          accessExpiresAt: DateTime.now()
              .add(Duration(seconds: (data['expiresIn'] as num?)?.toInt() ?? 900)),
        ),
      );
      // The token response carries a slim user; hydrate the full account
      // (emailVerified, providerId) from /me.
      return AuthResult.success(await me() ?? UserAccount.fromJson(data['user'])!);
    }
    return AuthResult.failure(_errorText(res));
  }

  /// Registers a customer account, then signs in through the token endpoint.
  /// A duplicate email returns the same generic `{ ok: true }` as the API
  /// (anti-enumeration #373) — the follow-up login then fails cleanly.
  Future<AuthResult> registerCustomer({
    required String name,
    required String email,
    required String phone,
    required String password,
  }) async {
    final res = await client.dio.post(
      '/api/auth/register',
      data: {
        'role': 'CUSTOMER',
        'name': name,
        'email': email,
        'phone': phone,
        'password': password,
      },
    );
    if (res.statusCode == 200) return login(email, password);
    return AuthResult.failure(_errorText(res));
  }

  Future<UserAccount?> me() async {
    final res = await client.dio.get('/api/auth/me');
    if (res.statusCode == 200 && res.data is Map) {
      return UserAccount.fromJson((res.data as Map)['user']);
    }
    return null;
  }

  /// Revokes the refresh token server-side and drops the local pair.
  Future<void> logout() async {
    final tokens = await client.tokenStore.read();
    if (tokens != null) {
      try {
        await client.dio.post(
          '/api/auth/revoke',
          data: {'refreshToken': tokens.refreshToken},
        );
      } on DioException {
        // Best-effort: local sign-out must never be blocked by the network.
      }
    }
    await client.tokenStore.clear();
  }

  Future<bool> resendVerification() async {
    final res = await client.dio.post('/api/auth/resend-verification');
    return res.statusCode == 200;
  }

  Future<bool> updateProfile({required String name, required String phone}) async {
    final res = await client.dio
        .put('/api/account/profile', data: {'name': name, 'phone': phone});
    return res.statusCode == 200;
  }

  static String _errorText(Response res) {
    final data = res.data;
    if (data is Map && data['error'] is String) return data['error'] as String;
    return 'Request failed (${res.statusCode})';
  }
}
