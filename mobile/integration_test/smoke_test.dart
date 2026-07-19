/// End-to-end smoke against a REAL local stack (docker compose up + seeded).
///
///   flutter test integration_test/smoke_test.dart -d macos \
///     --dart-define=API_BASE_URL=http://localhost:4000 \
///     --dart-define=WEB_BASE_URL=http://localhost:3000
///
/// Uses the demo seed accounts (CLAUDE.md): customer@baas.lk / password123.
/// Guest browse → sign in → browse → provider detail → inquiry → sign out.
library;

import 'package:baas_mobile/main.dart';
import 'package:baas_mobile/src/api/api_client.dart';
import 'package:baas_mobile/src/api/auth_repository.dart';
import 'package:baas_mobile/src/api/marketplace_api.dart';
import 'package:baas_mobile/src/api/token_store.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';

const _email = String.fromEnvironment('E2E_EMAIL', defaultValue: 'customer@baas.lk');
const _password =
    String.fromEnvironment('E2E_PASSWORD', defaultValue: 'password123');

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('guest browse → login → detail → inquiry → logout',
      (tester) async {
    await tester.pumpWidget(
        UncontrolledProviderScope(container: ProviderContainer(), child: const BaasApp()));
    await tester.pumpAndSettle(const Duration(seconds: 2));

    // 1. Guest browse: seeded providers render as cards.
    await _waitFor(tester, find.byType(Card), 'provider cards');

    // 2. Sign in through the Account tab.
    await tester.tap(find.byIcon(Icons.person_outline));
    await tester.pumpAndSettle();
    await tester.tap(find.byType(FilledButton).first); // "Sign in"
    await tester.pumpAndSettle();
    final fields = find.byType(TextFormField);
    await tester.enterText(fields.at(0), _email);
    await tester.enterText(fields.at(1), _password);
    await tester.tap(find.byType(FilledButton).first);
    await _waitFor(tester, find.byIcon(Icons.logout), 'signed-in account menu');

    // 3. Back to browse, open the first provider.
    await tester.tap(find.byIcon(Icons.search));
    await tester.pumpAndSettle();
    await tester.tap(find.byType(Card).first);
    await _waitFor(tester, find.byIcon(Icons.send), 'provider detail actions');

    // 4. Open the inquiry sheet, send a message.
    await tester.tap(find.byIcon(Icons.send).first);
    await tester.pumpAndSettle();
    final sheetFields = find.byType(TextFormField);
    await tester.enterText(
        sheetFields.at(2), 'Integration smoke inquiry — please ignore');
    await tester.tap(find.byType(FilledButton).last);
    await tester.pumpAndSettle(const Duration(seconds: 2));
    expect(find.byType(SnackBar), findsOneWidget);

    // 5. Sign out.
    await tester.tap(find.byIcon(Icons.person_outline));
    await tester.pumpAndSettle();
    await tester.tap(find.byIcon(Icons.logout));
    await tester.pumpAndSettle(const Duration(seconds: 1));
  });

  test('API-level: token → me → refresh rotation → revoke', () async {
    final client = ApiClient(tokenStore: TokenStore());
    final auth = AuthRepository(client);

    final login = await auth.login(_email, _password);
    expect(login.ok, isTrue, reason: 'token login should succeed: ${login.error}');
    expect(login.user!.email, _email);

    // Bearer round-trip through the gateway.
    final me = await auth.me();
    expect(me, isNotNull);

    // Forced refresh: rotation returns a new pair that still works.
    final before = await client.tokenStore.read();
    await client.tokenStore.write(StoredTokens(
      accessToken: before!.accessToken,
      refreshToken: before.refreshToken,
      accessExpiresAt: DateTime.now(), // force expiry
    ));
    final me2 = await auth.me();
    expect(me2, isNotNull, reason: 'refresh rotation should keep the session');
    final after = await client.tokenStore.read();
    expect(after!.refreshToken, isNot(before.refreshToken));

    // Browse + categories through the API layer.
    final api = MarketplaceApi(client);
    final page = await api.browse();
    expect(page.providers, isNotEmpty, reason: 'seeded providers expected');
    final categories = await api.categories();
    expect(categories, isNotEmpty);

    await auth.logout(); // revokes the refresh token
    final revoked = await ApiClient(tokenStore: client.tokenStore).accessToken();
    expect(revoked, isNull);
  });
}

Future<void> _waitFor(WidgetTester tester, Finder finder, String what,
    {Duration timeout = const Duration(seconds: 15)}) async {
  final end = DateTime.now().add(timeout);
  while (DateTime.now().isBefore(end)) {
    await tester.pump(const Duration(milliseconds: 250));
    if (finder.evaluate().isNotEmpty) return;
  }
  fail('timed out waiting for $what');
}
