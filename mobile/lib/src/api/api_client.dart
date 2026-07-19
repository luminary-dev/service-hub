import 'dart:async';

import 'package:dio/dio.dart';

import '../config.dart';
import 'token_store.dart';

/// Called when a refresh fails terminally (revoked/expired refresh token) —
/// the auth controller signs the user out.
typedef SessionExpiredHandler = Future<void> Function();

/// Dio client for the api-gateway.
///
/// - Attaches `Authorization: Bearer <access-jwt>` when signed in (#797).
/// - Proactively refreshes an expired access token, and retries exactly once
///   on a 401 (the token may have been revoked server-side between checks).
/// - Serializes concurrent refreshes behind a single in-flight future.
/// - Sends `Cookie: lang=<locale>` so the gateway's locale detection (the
///   `lang` cookie → x-locale) localizes emails and assistant replies.
class ApiClient {
  ApiClient({
    required this.tokenStore,
    Dio? dio,
    this.onSessionExpired,
  }) : dio = dio ?? Dio(BaseOptions(baseUrl: AppConfig.gatewayBaseUrl)) {
    this.dio.options.connectTimeout = const Duration(seconds: 10);
    this.dio.options.receiveTimeout = const Duration(seconds: 20);
    // Non-2xx handling stays with callers; treat only transport errors as
    // exceptions so error envelopes ({ error, code }) can be surfaced.
    this.dio.options.validateStatus = (status) => status != null && status < 500;
    this.dio.interceptors.add(_AuthInterceptor(this));
  }

  final Dio dio;
  final TokenStore tokenStore;
  SessionExpiredHandler? onSessionExpired;

  String locale = 'en';

  Future<String?>? _refreshInFlight;

  /// A valid access token, refreshing first if needed. Null when signed out.
  Future<String?> accessToken() async {
    final tokens = await tokenStore.read();
    if (tokens == null) return null;
    if (!tokens.accessExpired) return tokens.accessToken;
    return _refresh(tokens.refreshToken);
  }

  Future<String?> _refresh(String refreshToken) {
    // One refresh at a time; concurrent requests await the same rotation —
    // refresh tokens are single-use (rotated), so parallel calls would race.
    return _refreshInFlight ??= _doRefresh(refreshToken).whenComplete(() {
      _refreshInFlight = null;
    });
  }

  Future<String?> _doRefresh(String refreshToken) async {
    try {
      // A bare Dio: the interceptor must not recurse into itself.
      final res = await Dio(BaseOptions(baseUrl: AppConfig.gatewayBaseUrl)).post(
        '/api/auth/refresh',
        data: {'refreshToken': refreshToken},
        options: Options(validateStatus: (s) => s != null && s < 500),
      );
      if (res.statusCode == 200 && res.data is Map) {
        final data = res.data as Map;
        final tokens = StoredTokens(
          accessToken: data['accessToken'] as String,
          refreshToken: data['refreshToken'] as String,
          accessExpiresAt: DateTime.now()
              .add(Duration(seconds: (data['expiresIn'] as num?)?.toInt() ?? 900)),
        );
        await tokenStore.write(tokens);
        return tokens.accessToken;
      }
      if (res.statusCode == 401) {
        // Refresh token revoked (sessionVersion bump) or expired — sign out.
        await tokenStore.clear();
        await onSessionExpired?.call();
      }
      return null;
    } on DioException {
      // Network failure: keep tokens, caller proceeds unauthenticated and the
      // next request retries the refresh.
      return null;
    }
  }
}

class _AuthInterceptor extends Interceptor {
  _AuthInterceptor(this.client);

  final ApiClient client;

  @override
  Future<void> onRequest(
    RequestOptions options,
    RequestInterceptorHandler handler,
  ) async {
    final token = await client.accessToken();
    if (token != null) {
      options.headers['authorization'] = 'Bearer $token';
    }
    options.headers['cookie'] = 'lang=${client.locale}';
    handler.next(options);
  }

  @override
  Future<void> onResponse(
    Response response,
    ResponseInterceptorHandler handler,
  ) async {
    // One retry on 401: the access token can be revoked between our expiry
    // check and the gateway's sessionVersion check.
    if (response.statusCode == 401 &&
        response.requestOptions.extra['authRetried'] != true) {
      final tokens = await client.tokenStore.read();
      if (tokens != null) {
        final fresh = await client._refresh(tokens.refreshToken);
        if (fresh != null) {
          final opts = response.requestOptions;
          opts.extra['authRetried'] = true;
          opts.headers['authorization'] = 'Bearer $fresh';
          try {
            final retried = await client.dio.fetch<dynamic>(opts);
            return handler.resolve(retried);
          } on DioException {
            // Fall through with the original 401.
          }
        }
      }
    }
    handler.next(response);
  }
}
