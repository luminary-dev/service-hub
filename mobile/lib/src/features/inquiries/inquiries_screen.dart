import 'package:flutter/material.dart';
import 'package:baas_mobile/l10n/gen/app_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../models/models.dart';
import '../../state/providers.dart';
import '../../widgets/common.dart';

final myInquiriesProvider = FutureProvider.autoDispose<List<Inquiry>>(
    (ref) => ref.watch(marketplaceApiProvider).myInquiries());

class InquiriesScreen extends ConsumerWidget {
  const InquiriesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final inquiries = ref.watch(myInquiriesProvider);
    return Scaffold(
      appBar: AppBar(title: Text(l10n.myInquiries)),
      body: switch (inquiries) {
        AsyncData(:final value) when value.isEmpty =>
          EmptyState(message: l10n.noInquiries, icon: Icons.forum_outlined),
        AsyncData(:final value) => RefreshIndicator(
            onRefresh: () async => ref.refresh(myInquiriesProvider.future),
            child: ListView.separated(
              itemCount: value.length,
              separatorBuilder: (_, _) => const Divider(height: 1),
              itemBuilder: (context, i) {
                final inquiry = value[i];
                return ListTile(
                  leading: CircleAvatar(
                    child: Text(
                      inquiry.provider?.name.isNotEmpty == true
                          ? inquiry.provider!.name[0]
                          : '?',
                    ),
                  ),
                  title: Text(inquiry.provider?.name ?? ''),
                  subtitle: Text(
                    inquiry.message,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  trailing: inquiry.unreadCount > 0
                      ? Badge(label: Text('${inquiry.unreadCount}'))
                      : null,
                  onTap: () => context.push(
                    '/inquiries/${inquiry.id}?name=${Uri.encodeComponent(inquiry.provider?.name ?? '')}',
                  ),
                );
              },
            ),
          ),
        AsyncError() =>
          ErrorRetry(onRetry: () => ref.invalidate(myInquiriesProvider)),
        _ => const Center(child: CircularProgressIndicator()),
      },
    );
  }
}
