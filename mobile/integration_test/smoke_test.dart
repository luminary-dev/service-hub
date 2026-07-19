/// End-to-end smoke against a REAL local stack (docker compose up + seeded).
///
///   flutter test integration_test/smoke_test.dart -d macos \
///     --dart-define=API_BASE_URL=http://localhost:4000 \
///     --dart-define=WEB_BASE_URL=http://localhost:3000 \
///     --dart-define=E2E_EMAIL=customer@baas.lk
///
/// Uses the demo seed accounts (CLAUDE.md); all passwords are `password123`.
library;

import 'dart:io' show HttpException;

import 'package:baas_mobile/main.dart';
import 'package:baas_mobile/src/api/api_client.dart';
import 'package:baas_mobile/src/api/auth_repository.dart';
import 'package:baas_mobile/src/api/marketplace_api.dart';
import 'package:baas_mobile/src/api/token_store.dart';
import 'package:baas_mobile/src/features/account/login_screen.dart';
import 'package:baas_mobile/src/features/provider_detail/provider_detail_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';

const _email =
    String.fromEnvironment('E2E_EMAIL', defaultValue: 'customer@baas.lk');
const _password =
    String.fromEnvironment('E2E_PASSWORD', defaultValue: 'password123');

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  // Guest browse → open a real provider profile → its body renders from seeded
  // data. Provider detail is public, so this needs no auth and stays on one tab
  // (no IndexedStack offstage/onstage churn).
  testWidgets('guest: browse → provider detail renders', (tester) async {
    _ignoreImageLoadErrors();
    await tester.pumpWidget(UncontrolledProviderScope(
        container: ProviderContainer(), child: const BaasApp()));
    await tester.pumpAndSettle(const Duration(seconds: 2));

    await _waitFor(tester, find.byType(Card), 'provider cards');
    await tester.tap(find.byType(Card).first);

    final detailScope = find.byType(ProviderDetailScreen);
    await _waitFor(tester, detailScope, 'provider detail screen');
    // Reaching the data-driven body at all means /providers/:id/full resolved
    // (the screen shows a spinner until then). Both action buttons always
    // render for a loaded profile, independent of which seed fields are set.
    await _waitFor(
        tester,
        find.descendant(
            of: detailScope,
            matching: find.widgetWithText(FilledButton, 'Send inquiry')),
        'inquiry action');
    expect(
        find.descendant(
            of: detailScope,
            matching:
                find.widgetWithText(OutlinedButton, 'Show contact details')),
        findsOneWidget);
  });

  // Login → signed-in account view → logout, all on the Account tab.
  testWidgets('login → account → logout', (tester) async {
    _ignoreImageLoadErrors();
    await tester.pumpWidget(UncontrolledProviderScope(
        container: ProviderContainer(), child: const BaasApp()));
    await tester.pumpAndSettle(const Duration(seconds: 2));

    await _tapTab(tester, 'Account');
    final guestSignIn = find.widgetWithText(FilledButton, 'Sign in');
    await _waitFor(tester, guestSignIn, 'guest sign-in button');
    await tester.tap(guestSignIn);
    await tester.pumpAndSettle();

    final loginScope = find.byType(LoginScreen);
    await _waitFor(tester, loginScope, 'login screen');
    final loginFields =
        find.descendant(of: loginScope, matching: find.byType(TextFormField));
    await tester.enterText(loginFields.at(0), _email);
    await tester.enterText(loginFields.at(1), _password);
    await tester.tap(
        find.descendant(of: loginScope, matching: find.byType(FilledButton)));

    // Bearer login succeeded → the account menu shows the sign-out action.
    await _waitFor(tester, find.byIcon(Icons.logout), 'signed-in account menu');
    await tester.pumpAndSettle(); // finish the login→account transition
    await tester.ensureVisible(find.byIcon(Icons.logout));
    await tester.tap(find.byIcon(Icons.logout));
    await _waitFor(tester, find.widgetWithText(FilledButton, 'Sign in'),
        'guest account view after logout');
  });

  // API layer against the real gateway: token login → Bearer /me → forced
  // refresh rotation → browse/categories → revoke-on-logout.
  test('API-level: token → me → refresh rotation → revoke', () async {
    final client = ApiClient(tokenStore: TokenStore());
    final auth = AuthRepository(client);

    final login = await auth.login(_email, _password);
    expect(login.ok, isTrue,
        reason: 'token login should succeed: ${login.error}');
    expect(login.user!.email, _email);

    // Bearer round-trip through the gateway.
    expect(await auth.me(), isNotNull);

    // Forced refresh: rotation returns a new pair that still works.
    final before = await client.tokenStore.read();
    await client.tokenStore.write(StoredTokens(
      accessToken: before!.accessToken,
      refreshToken: before.refreshToken,
      accessExpiresAt: DateTime.now(), // force expiry
    ));
    expect(await auth.me(), isNotNull,
        reason: 'refresh rotation should keep the session');
    final after = await client.tokenStore.read();
    expect(after!.refreshToken, isNot(before.refreshToken));

    // Reads through the API layer.
    final page = await MarketplaceApi(client).browse();
    expect(page.providers, isNotEmpty, reason: 'seeded providers expected');
    expect(await MarketplaceApi(client).categories(), isNotEmpty);

    await auth.logout(); // revokes the refresh token
    expect(await ApiClient(tokenStore: client.tokenStore).accessToken(), isNull);
  });
}

/// Some seed providers reference placeholder image paths that 404 locally
/// (media serving of the demo images isn't wired on this path). The app handles
/// that gracefully with an errorWidget, but CachedNetworkImage still reports the
/// HttpException to FlutterError, which the harness would treat as a failure.
/// testWidgets installs the binding's handler per test, so this must run inside
/// each test body to take effect. Swallow only image-load network errors.
void _ignoreImageLoadErrors() {
  final previous = FlutterError.onError;
  FlutterError.onError = (details) {
    final ex = details.exception;
    if (ex is NetworkImageLoadException ||
        ex is HttpException ||
        ex.runtimeType.toString() == 'HttpExceptionWithStatus') {
      return;
    }
    previous?.call(details);
  };
}

/// Taps a bottom-nav destination by its label, scoped to the NavigationBar.
/// The label reliably sits inside the destination's tap target (the bare icon
/// can land just outside it), and scoping avoids identical text/icons inside
/// offstage IndexedStack branches.
Future<void> _tapTab(WidgetTester tester, String label) async {
  await tester.tap(find.descendant(
      of: find.byType(NavigationBar), matching: find.text(label)));
  await tester.pumpAndSettle();
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
