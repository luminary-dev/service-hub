import 'dart:io' show Platform;

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';

import '../api/marketplace_api.dart';

/// FCM wrapper that degrades to a no-op when Firebase isn't configured — the
/// backend push path (#798) is equally fail-soft, so the app works fully
/// (in-app notifications, polling) without any Firebase project.
///
/// Enabling push:
///  1. `flutterfire configure` in mobile/ (writes firebase_options.dart +
///     platform config) and pass the options to [init].
///  2. Give ops the service-account JSON for notification-service
///     (FCM_SERVICE_ACCOUNT / FCM_PROJECT_ID).
class PushService {
  PushService(this.api);

  final MarketplaceApi api;
  bool _available = false;
  String? _registeredToken;

  Future<void> init({FirebaseOptions? options}) async {
    if (kIsWeb) return;
    try {
      await Firebase.initializeApp(options: options);
      _available = true;
    } catch (e) {
      // No google-services.json / plist / options: run without push.
      debugPrint('push disabled: $e');
    }
  }

  Future<void> register() async {
    if (!_available) return;
    try {
      final messaging = FirebaseMessaging.instance;
      final permission = await messaging.requestPermission();
      if (permission.authorizationStatus == AuthorizationStatus.denied) return;
      final token = await messaging.getToken();
      if (token == null || token == _registeredToken) return;
      await api.registerDevice(token, Platform.isIOS ? 'ios' : 'android');
      _registeredToken = token;
      messaging.onTokenRefresh.listen((fresh) async {
        await api.registerDevice(fresh, Platform.isIOS ? 'ios' : 'android');
        _registeredToken = fresh;
      });
    } catch (e) {
      debugPrint('push registration failed: $e');
    }
  }

  Future<void> unregister() async {
    final token = _registeredToken;
    if (token == null) return;
    _registeredToken = null;
    try {
      await api.unregisterDevice(token);
    } catch (_) {
      // Best-effort — the backend prunes dead tokens on FCM rejection anyway.
    }
  }
}
