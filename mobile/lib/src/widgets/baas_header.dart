import 'package:baas_mobile/l10n/gen/app_localizations.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:font_awesome_flutter/font_awesome_flutter.dart';

import '../palette.dart';
import '../state/providers.dart';
import '../theme.dart';
import 'wordmark.dart';

/// The shared top-nav header, mirroring the web's Navbar.tsx: a sticky bar with
/// a bottom hairline, the wordmark on the left, mono-uppercase nav links, and
/// the utility cluster (theme toggle · language · notification bell · account)
/// on the right. Nav links switch the shell's branch.
class BaasHeader extends ConsumerWidget implements PreferredSizeWidget {
  const BaasHeader({super.key, required this.shell});

  final dynamic shell; // StatefulNavigationShell (kept loose to avoid a cycle)

  @override
  Size get preferredSize => const Size.fromHeight(58);

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final p = context.palette;
    final signedIn = ref.watch(authControllerProvider).value != null;
    final unread = ref.watch(unreadCountProvider).value ?? 0;
    final themeMode = ref.watch(themeControllerProvider);
    final locale = ref.watch(localeControllerProvider);
    final index = shell.currentIndex as int;

    return Material(
      color: p.ink.c50,
      child: SafeArea(
        bottom: false,
        child: DecoratedBox(
          decoration: BoxDecoration(
            border: Border(bottom: BorderSide(color: p.ink.c300)),
          ),
          child: SizedBox(
            height: 57,
            child: Row(
              children: [
                const SizedBox(width: 16),
                InkWell(
                  onTap: () => shell.goBranch(0),
                  child: const Wordmark(),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: SingleChildScrollView(
                    scrollDirection: Axis.horizontal,
                    child: Row(
                      children: [
                        _NavLink(
                          label: l10n.navFind,
                          active: index == 0,
                          onTap: () => shell.goBranch(0),
                        ),
                        _NavLink(
                          label: l10n.tabJobs,
                          active: index == 1,
                          onTap: () => shell.goBranch(1),
                        ),
                      ],
                    ),
                  ),
                ),
                // Utility cluster.
                IconButton(
                  tooltip: 'Theme',
                  visualDensity: VisualDensity.compact,
                  icon: FaIcon(
                    themeMode == ThemeMode.dark
                        ? FontAwesomeIcons.sun
                        : FontAwesomeIcons.moon,
                    size: 16,
                    color: p.ink.c600,
                  ),
                  onPressed: () =>
                      ref.read(themeControllerProvider.notifier).toggle(),
                ),
                InkWell(
                  onTap: () => ref.read(localeControllerProvider.notifier).set(
                        locale.languageCode == 'si'
                            ? const Locale('en')
                            : const Locale('si'),
                      ),
                  borderRadius: BorderRadius.circular(6),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
                    child: Text(
                      locale.languageCode == 'si' ? 'EN' : 'සිං',
                      style: TextStyle(
                        fontFamily: kFontMono,
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                        color: p.ink.c600,
                      ),
                    ),
                  ),
                ),
                if (signedIn)
                  IconButton(
                    tooltip: l10n.notifications,
                    visualDensity: VisualDensity.compact,
                    icon: Badge(
                      isLabelVisible: unread > 0,
                      label: Text('$unread'),
                      child: FaIcon(
                        FontAwesomeIcons.bell,
                        size: 16,
                        color: index == 3 ? p.brand.c700 : p.ink.c600,
                      ),
                    ),
                    onPressed: () => shell.goBranch(3),
                  ),
                IconButton(
                  tooltip: l10n.tabAccount,
                  visualDensity: VisualDensity.compact,
                  icon: FaIcon(
                    FontAwesomeIcons.user,
                    size: 16,
                    color: index == 4 ? p.brand.c700 : p.ink.c600,
                  ),
                  onPressed: () => shell.goBranch(4),
                ),
                const SizedBox(width: 6),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Mono uppercase nav link, steel by default and brand when active — the web's
/// `navLink` treatment.
class _NavLink extends StatelessWidget {
  const _NavLink({
    required this.label,
    required this.active,
    required this.onTap,
  });

  final String label;
  final bool active;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(6),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
        child: Text(
          label.toUpperCase(),
          style: TextStyle(
            fontFamily: kFontMono,
            fontSize: 11,
            fontWeight: FontWeight.w600,
            letterSpacing: 1.3,
            color: active ? p.brand.c700 : p.ink.c600,
          ),
        ),
      ),
    );
  }
}
