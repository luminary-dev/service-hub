import 'package:flutter/material.dart';
import 'package:baas_mobile/l10n/gen/app_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:font_awesome_flutter/font_awesome_flutter.dart';
import 'package:go_router/go_router.dart';

import 'features/account/account_screen.dart';
import 'features/account/favorites_screen.dart';
import 'features/account/login_screen.dart';
import 'features/account/register_screen.dart';
import 'features/browse/browse_screen.dart';
import 'features/chat/chat_screen.dart';
import 'features/inquiries/inquiries_screen.dart';
import 'features/inquiries/thread_screen.dart';
import 'features/jobs/jobs_screen.dart';
import 'features/jobs/post_job_screen.dart';
import 'features/notifications/notifications_screen.dart';
import 'features/provider_detail/provider_detail_screen.dart';
import 'state/providers.dart';

final routerProvider = Provider<GoRouter>((ref) {
  return GoRouter(
    initialLocation: '/browse',
    routes: [
      // Full-screen routes outside the tab shell.
      GoRoute(path: '/login', builder: (_, _) => const LoginScreen()),
      GoRoute(path: '/register', builder: (_, _) => const RegisterScreen()),
      GoRoute(
        path: '/providers/:id',
        builder: (_, state) =>
            ProviderDetailScreen(providerId: state.pathParameters['id']!),
      ),
      GoRoute(
        path: '/inquiries/:id',
        builder: (_, state) => ThreadScreen(
          inquiryId: state.pathParameters['id']!,
          providerName: state.uri.queryParameters['name'] ?? '',
        ),
      ),
      GoRoute(path: '/inquiries', builder: (_, _) => const InquiriesScreen()),
      GoRoute(path: '/favorites', builder: (_, _) => const FavoritesScreen()),
      GoRoute(path: '/jobs/new', builder: (_, _) => const PostJobScreen()),
      StatefulShellRoute.indexedStack(
        builder: (_, _, shell) => _TabShell(shell: shell),
        branches: [
          StatefulShellBranch(routes: [
            GoRoute(path: '/browse', builder: (_, _) => const BrowseScreen()),
          ]),
          StatefulShellBranch(routes: [
            GoRoute(path: '/jobs', builder: (_, _) => const JobsScreen()),
          ]),
          StatefulShellBranch(routes: [
            GoRoute(path: '/chat', builder: (_, _) => const ChatScreen()),
          ]),
          StatefulShellBranch(routes: [
            GoRoute(
              path: '/notifications',
              builder: (_, _) => const NotificationsScreen(),
            ),
          ]),
          StatefulShellBranch(routes: [
            GoRoute(path: '/account', builder: (_, _) => const AccountScreen()),
          ]),
        ],
      ),
    ],
  );
});

class _TabShell extends ConsumerWidget {
  const _TabShell({required this.shell});

  final StatefulNavigationShell shell;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final unread = ref.watch(unreadCountProvider).value ?? 0;
    return Scaffold(
      body: shell,
      bottomNavigationBar: NavigationBar(
        selectedIndex: shell.currentIndex,
        onDestinationSelected: shell.goBranch,
        destinations: [
          NavigationDestination(
            icon: const FaIcon(FontAwesomeIcons.magnifyingGlass, size: 18),
            label: l10n.tabBrowse,
          ),
          NavigationDestination(
            icon: const FaIcon(FontAwesomeIcons.briefcase, size: 18),
            label: l10n.tabJobs,
          ),
          NavigationDestination(
            icon: const FaIcon(FontAwesomeIcons.solidCommentDots, size: 18),
            label: l10n.tabChat,
          ),
          NavigationDestination(
            icon: Badge(
              isLabelVisible: unread > 0,
              label: Text('$unread'),
              child: const FaIcon(FontAwesomeIcons.bell, size: 18),
            ),
            label: l10n.tabNotifications,
          ),
          NavigationDestination(
            icon: const FaIcon(FontAwesomeIcons.user, size: 18),
            label: l10n.tabAccount,
          ),
        ],
      ),
    );
  }
}
