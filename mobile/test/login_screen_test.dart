import 'package:baas_mobile/l10n/gen/app_localizations.dart';
import 'package:baas_mobile/src/features/account/login_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

Widget _wrap(Widget child) {
  return ProviderScope(
    child: MaterialApp(
      supportedLocales: AppLocalizations.supportedLocales,
      localizationsDelegates: const [
        AppLocalizations.delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      home: child,
    ),
  );
}

void main() {
  testWidgets('login form validates before submitting', (tester) async {
    await tester.pumpWidget(_wrap(const LoginScreen()));
    await tester.pumpAndSettle();

    // Submit empty → both fields flag required, no network call happens
    // (a call would throw in the test env and surface as an error banner).
    await tester.tap(find.widgetWithText(FilledButton, 'Sign in'));
    await tester.pumpAndSettle();
    expect(find.text('This field is required'), findsNWidgets(2));
  });

  testWidgets('renders Sinhala under the si locale', (tester) async {
    await tester.pumpWidget(
      ProviderScope(
        child: MaterialApp(
          locale: const Locale('si'),
          supportedLocales: AppLocalizations.supportedLocales,
          localizationsDelegates: const [
            AppLocalizations.delegate,
            GlobalMaterialLocalizations.delegate,
            GlobalWidgetsLocalizations.delegate,
            GlobalCupertinoLocalizations.delegate,
          ],
          home: const LoginScreen(),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('පිවිසෙන්න'), findsWidgets);
  });
}
