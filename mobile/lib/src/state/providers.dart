import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../api/api_client.dart';
import '../api/auth_repository.dart';
import '../api/chat_repository.dart';
import '../api/marketplace_api.dart';
import '../api/token_store.dart';
import '../models/models.dart';
import '../push/push_service.dart';

final tokenStoreProvider = Provider<TokenStore>((ref) => TokenStore());

final apiClientProvider = Provider<ApiClient>((ref) {
  final client = ApiClient(tokenStore: ref.watch(tokenStoreProvider));
  client.onSessionExpired = () async {
    ref.read(authControllerProvider.notifier).onSessionExpired();
  };
  return client;
});

final authRepositoryProvider =
    Provider<AuthRepository>((ref) => AuthRepository(ref.watch(apiClientProvider)));

final marketplaceApiProvider =
    Provider<MarketplaceApi>((ref) => MarketplaceApi(ref.watch(apiClientProvider)));

final chatRepositoryProvider =
    Provider<ChatRepository>((ref) => ChatRepository(ref.watch(apiClientProvider)));

final pushServiceProvider = Provider<PushService>(
    (ref) => PushService(ref.watch(marketplaceApiProvider)));

/// Signed-in account, or null. Loading = restoring the persisted session.
class AuthController extends AsyncNotifier<UserAccount?> {
  @override
  Future<UserAccount?> build() async {
    final tokens = await ref.read(tokenStoreProvider).read();
    if (tokens == null) return null;
    final user = await ref.read(authRepositoryProvider).me();
    if (user != null) {
      ref.read(pushServiceProvider).register();
    }
    return user;
  }

  Future<String?> login(String email, String password) async {
    final result = await ref.read(authRepositoryProvider).login(email, password);
    if (result.ok) {
      state = AsyncData(result.user);
      ref.read(pushServiceProvider).register();
      return null;
    }
    return result.error;
  }

  Future<String?> registerCustomer({
    required String name,
    required String email,
    required String phone,
    required String password,
  }) async {
    final result = await ref.read(authRepositoryProvider).registerCustomer(
        name: name, email: email, phone: phone, password: password);
    if (result.ok) {
      state = AsyncData(result.user);
      ref.read(pushServiceProvider).register();
      return null;
    }
    return result.error;
  }

  Future<void> logout() async {
    await ref.read(pushServiceProvider).unregister();
    await ref.read(authRepositoryProvider).logout();
    state = const AsyncData(null);
  }

  /// Refresh token rejected (sessionVersion bump / expiry) — local sign-out.
  void onSessionExpired() {
    state = const AsyncData(null);
  }

  Future<void> reload() async {
    state = AsyncData(await ref.read(authRepositoryProvider).me());
  }
}

final authControllerProvider =
    AsyncNotifierProvider<AuthController, UserAccount?>(AuthController.new);

/// Persisted UI locale (en/si). Also steers the API `lang` cookie.
class LocaleController extends Notifier<Locale> {
  static const _storage = FlutterSecureStorage();
  static const _key = 'baas_locale';

  @override
  Locale build() {
    _storage.read(key: _key).then((v) {
      if (v == 'si') state = const Locale('si');
    });
    return const Locale('en');
  }

  void set(Locale locale) {
    state = locale;
    ref.read(apiClientProvider).locale = locale.languageCode;
    _storage.write(key: _key, value: locale.languageCode);
  }
}

final localeControllerProvider =
    NotifierProvider<LocaleController, Locale>(LocaleController.new);

final categoriesProvider = FutureProvider<List<CategoryOption>>(
    (ref) => ref.watch(marketplaceApiProvider).categories());

/// Favorite provider ids; loaded once per sign-in, toggled optimistically.
class FavoritesController extends AsyncNotifier<Set<String>> {
  @override
  Future<Set<String>> build() async {
    final user = ref.watch(authControllerProvider).value;
    if (user == null) return {};
    return ref.read(marketplaceApiProvider).favoriteIds();
  }

  Future<void> toggle(String providerId) async {
    final current = state.value ?? {};
    final favorited = !current.contains(providerId);
    state = AsyncData({
      ...current.where((id) => id != providerId),
      if (favorited) providerId,
    });
    final ok = await ref
        .read(marketplaceApiProvider)
        .setFavorite(providerId, favorited);
    if (!ok) state = AsyncData(current); // roll back
  }
}

final favoritesControllerProvider =
    AsyncNotifierProvider<FavoritesController, Set<String>>(FavoritesController.new);

final unreadCountProvider = FutureProvider<int>((ref) async {
  final user = ref.watch(authControllerProvider).value;
  if (user == null) return 0;
  return ref.watch(marketplaceApiProvider).unreadCount();
});
