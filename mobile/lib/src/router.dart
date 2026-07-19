import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'features/account/account_screen.dart';
import 'features/account/favorites_screen.dart';
import 'features/account/login_screen.dart';
import 'features/account/register_screen.dart';
import 'features/browse/results_screen.dart';
import 'features/chat/chat_screen.dart';
import 'features/home/home_screen.dart';
import 'features/inquiries/inquiries_screen.dart';
import 'features/inquiries/thread_screen.dart';
import 'features/jobs/jobs_screen.dart';
import 'features/jobs/post_job_screen.dart';
import 'features/notifications/notifications_screen.dart';
import 'features/provider_detail/provider_detail_screen.dart';
import 'tv/tv_chrome.dart';

final routerProvider = Provider<GoRouter>((ref) {
  return GoRouter(
    initialLocation: '/browse',
    routes: [
      GoRoute(path: '/login', builder: (_, _) => const LoginScreen()),
      GoRoute(path: '/register', builder: (_, _) => const RegisterScreen()),
      GoRoute(
        path: '/results',
        builder: (_, state) =>
            ResultsScreen(initialCategory: state.uri.queryParameters['category']),
      ),
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
            GoRoute(path: '/browse', builder: (_, _) => const HomeScreen()),
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

/// The TV-style shell: content is full-bleed (each screen owns its frosted
/// header), and a floating glass tab bar sits over the bottom. `extendBody`
/// lets the content scroll behind the bar.
class _TabShell extends ConsumerWidget {
  const _TabShell({required this.shell});

  final StatefulNavigationShell shell;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Scaffold(
      extendBody: true,
      body: shell,
      bottomNavigationBar: GlassTabBar(
        index: shell.currentIndex,
        onSelect: shell.goBranch,
      ),
    );
  }
}
