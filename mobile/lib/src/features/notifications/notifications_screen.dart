import 'package:flutter/material.dart';
import 'package:baas_mobile/l10n/gen/app_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../models/models.dart';
import '../../palette.dart';
import '../../state/providers.dart';
import '../../widgets/common.dart';

final notificationsProvider = FutureProvider.autoDispose(
    (ref) => ref.watch(marketplaceApiProvider).notifications());

class NotificationsScreen extends ConsumerWidget {
  const NotificationsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final signedIn = ref.watch(authControllerProvider).value != null;
    if (!signedIn) {
      return Scaffold(
        body: Column(
          children: [
            PageHeading(title: l10n.notifications),
            Expanded(
              child: Center(
                child: Padding(
                  padding: const EdgeInsets.all(32),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(l10n.guestBrowsePrompt, textAlign: TextAlign.center),
                      const SizedBox(height: 16),
                      FilledButton(
                        onPressed: () => context.push('/login'),
                        child: Text(l10n.signIn),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ],
        ),
      );
    }
    final notifications = ref.watch(notificationsProvider);
    return Scaffold(
      body: Column(
        children: [
          PageHeading(
            title: l10n.notifications,
            trailing: TextButton(
              onPressed: () async {
                await ref.read(marketplaceApiProvider).markRead(all: true);
                ref.invalidate(notificationsProvider);
                ref.invalidate(unreadCountProvider);
              },
              child: Text(l10n.markAllRead),
            ),
          ),
          Expanded(
            child: switch (notifications) {
              AsyncData(:final value) when value.items.isEmpty => EmptyState(
                  message: l10n.noNotifications,
                  icon: Icons.notifications_none),
              AsyncData(:final value) => RefreshIndicator(
                  onRefresh: () async =>
                      ref.refresh(notificationsProvider.future),
                  child: ListView.separated(
                    itemCount: value.items.length,
                    separatorBuilder: (_, _) => const Divider(height: 1),
                    itemBuilder: (context, i) =>
                        _NotificationTile(item: value.items[i]),
                  ),
                ),
              AsyncError() =>
                ErrorRetry(onRetry: () => ref.invalidate(notificationsProvider)),
              _ => const Center(child: CircularProgressIndicator()),
            },
          ),
        ],
      ),
    );
  }
}

class _NotificationTile extends ConsumerWidget {
  const _NotificationTile({required this.item});

  final NotificationItem item;

  /// Compact per-type sentence from the payload — the API sends structured
  /// payloads and the client renders text (same contract the web bell uses).
  String _text(AppLocalizations l10n) {
    final p = item.payload;
    final actor = p['providerName'] ?? p['customerName'] ?? p['name'] ?? '';
    return switch (item.type) {
      'THREAD_REPLY' => '$actor: ${p['preview'] ?? l10n.reply}',
      'NEW_INQUIRY' => '$actor — ${p['preview'] ?? ''}',
      'REVIEW_RESPONSE' => '$actor · ${l10n.reviewsSection}',
      'JOB_RESPONSE' => '$actor · ${l10n.tabJobs}',
      'NEW_JOB_MATCH' => '${p['title'] ?? ''} · ${l10n.tabJobs}',
      'SAVED_SEARCH_MATCH' => '${p['name'] ?? ''} · ${p['category'] ?? ''}',
      _ => (p['preview'] ?? p['title'] ?? item.type.replaceAll('_', ' '))
          .toString(),
    };
  }

  IconData get _icon => switch (item.type) {
        'THREAD_REPLY' || 'NEW_INQUIRY' => Icons.forum_outlined,
        'NEW_REVIEW' || 'REVIEW_RESPONSE' => Icons.star_border,
        'NEW_JOB_MATCH' || 'JOB_RESPONSE' => Icons.work_outline,
        'VERIFICATION_APPROVED' => Icons.verified_outlined,
        _ => Icons.notifications_none,
      };

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    return ListTile(
      leading: Icon(_icon),
      title: Text(
        _text(l10n),
        maxLines: 2,
        overflow: TextOverflow.ellipsis,
        style: item.unread ? const TextStyle(fontWeight: FontWeight.w600) : null,
      ),
      trailing: item.unread
          ? Icon(Icons.circle, size: 10, color: context.palette.brand.c700)
          : null,
      onTap: () async {
        if (item.unread) {
          await ref.read(marketplaceApiProvider).markRead(ids: [item.id]);
          ref.invalidate(notificationsProvider);
          ref.invalidate(unreadCountProvider);
        }
        // Deep links are web-relative (e.g. /account/inquiries); route the
        // ones the app has screens for.
        final link = item.link ?? '';
        if (!context.mounted) return;
        if (link.contains('/inquiries')) {
          context.push('/inquiries');
        } else if (link.contains('/jobs')) {
          context.go('/jobs');
        } else if (link.startsWith('/providers/')) {
          context.push(link);
        }
      },
    );
  }
}
