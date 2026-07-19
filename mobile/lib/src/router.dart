import 'package:flutter/material.dart';
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
import 'widgets/baas_header.dart';

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

// Branch indices in the StatefulShellRoute.
const _iChat = 2;

class _TabShell extends ConsumerWidget {
  const _TabShell({required this.shell});

  final StatefulNavigationShell shell;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // Mirror the web (Navbar.tsx): a sticky top header — wordmark left, mono
    // uppercase nav links, utility toggles + notification bell + account right.
    // The assistant is a floating button, like the web's ChatAssistant FAB.
    return Scaffold(
      appBar: BaasHeader(shell: shell),
      body: shell,
      floatingActionButton: shell.currentIndex == _iChat
          ? null
          : FloatingActionButton(
              heroTag: 'assistant',
              onPressed: () => shell.goBranch(_iChat),
              child: const FaIcon(FontAwesomeIcons.solidCommentDots, size: 20),
            ),
    );
  }
}
