import 'package:flutter/material.dart';
import 'package:baas_mobile/l10n/gen/app_localizations.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'src/palette.dart';
import 'src/router.dart';
import 'src/state/providers.dart';
import 'src/theme.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final container = ProviderContainer();
  // Push degrades to a no-op without Firebase config (see PushService).
  await container.read(pushServiceProvider).init();
  runApp(
    UncontrolledProviderScope(container: container, child: const BaasApp()),
  );
}

class BaasApp extends ConsumerWidget {
  const BaasApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final locale = ref.watch(localeControllerProvider);
    final router = ref.watch(routerProvider);
    return MaterialApp.router(
      title: 'Baas.lk',
      theme: buildTheme(Palette.light),
      darkTheme: buildTheme(Palette.dark),
      // Follow the OS, like the web (which honors the system preference when no
      // explicit theme cookie is set).
      themeMode: ThemeMode.system,
      locale: locale,
      supportedLocales: AppLocalizations.supportedLocales,
      localizationsDelegates: const [
        AppLocalizations.delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      routerConfig: router,
    );
  }
}
