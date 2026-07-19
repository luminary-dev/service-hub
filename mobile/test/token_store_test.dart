import 'package:baas_mobile/src/api/token_store.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';

/// In-memory stand-in — the real storage is a platform keychain plugin.
class _FakeStorage extends FlutterSecureStorage {
  const _FakeStorage._();

  factory _FakeStorage() => const _FakeStorage._();

  static final _data = <String, String>{};

  @override
  Future<String?> read({
    required String key,
    AppleOptions? iOptions,
    AndroidOptions? aOptions,
    LinuxOptions? lOptions,
    WebOptions? webOptions,
    AppleOptions? mOptions,
    WindowsOptions? wOptions,
  }) async =>
      _data[key];

  @override
  Future<void> write({
    required String key,
    required String? value,
    AppleOptions? iOptions,
    AndroidOptions? aOptions,
    LinuxOptions? lOptions,
    WebOptions? webOptions,
    AppleOptions? mOptions,
    WindowsOptions? wOptions,
  }) async {
    if (value == null) {
      _data.remove(key);
    } else {
      _data[key] = value;
    }
  }

  @override
  Future<void> delete({
    required String key,
    AppleOptions? iOptions,
    AndroidOptions? aOptions,
    LinuxOptions? lOptions,
    WebOptions? webOptions,
    AppleOptions? mOptions,
    WindowsOptions? wOptions,
  }) async {
    _data.remove(key);
  }
}

void main() {
  setUp(_FakeStorage._data.clear);

  group('StoredTokens', () {
    test('accessExpired honors the 30s early-refresh margin', () {
      final live = StoredTokens(
        accessToken: 'a',
        refreshToken: 'r',
        accessExpiresAt: DateTime.now().add(const Duration(minutes: 5)),
      );
      final nearlyExpired = StoredTokens(
        accessToken: 'a',
        refreshToken: 'r',
        accessExpiresAt: DateTime.now().add(const Duration(seconds: 10)),
      );
      expect(live.accessExpired, isFalse);
      expect(nearlyExpired.accessExpired, isTrue);
    });

    test('round-trips through JSON', () {
      final tokens = StoredTokens(
        accessToken: 'access',
        refreshToken: 'refresh',
        accessExpiresAt: DateTime.parse('2026-07-19T12:00:00Z'),
      );
      final back = StoredTokens.fromJson(tokens.toJson());
      expect(back!.accessToken, 'access');
      expect(back.refreshToken, 'refresh');
      expect(back.accessExpiresAt, tokens.accessExpiresAt);
    });

    test('rejects malformed persisted JSON', () {
      expect(StoredTokens.fromJson({'accessToken': 1}), isNull);
    });
  });

  group('TokenStore', () {
    test('write → read → clear', () async {
      final store = TokenStore(_FakeStorage());
      expect(await store.read(), isNull);
      await store.write(StoredTokens(
        accessToken: 'a',
        refreshToken: 'r',
        accessExpiresAt: DateTime.now().add(const Duration(minutes: 15)),
      ));
      expect((await store.read())!.accessToken, 'a');
      await store.clear();
      expect(await store.read(), isNull);
      // The cleared state must also be persisted, not just cached.
      expect(await TokenStore(_FakeStorage()).read(), isNull);
    });
  });
}
