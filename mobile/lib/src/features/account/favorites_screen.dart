import 'package:flutter/material.dart';
import 'package:baas_mobile/l10n/gen/app_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../models/models.dart';
import '../../state/providers.dart';
import '../../widgets/common.dart';

final favoriteProvidersProvider =
    FutureProvider.autoDispose<List<ProviderSummary>>((ref) async {
  final ids = await ref.watch(favoritesControllerProvider.future);
  return ref.watch(marketplaceApiProvider).providersByIds(ids);
});

class FavoritesScreen extends ConsumerWidget {
  const FavoritesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final favorites = ref.watch(favoriteProvidersProvider);
    return Scaffold(
      appBar: AppBar(title: Text(l10n.favorites)),
      body: switch (favorites) {
        AsyncData(:final value) when value.isEmpty =>
          EmptyState(message: l10n.noFavorites, icon: Icons.favorite_border),
        AsyncData(:final value) => ListView.separated(
            padding: const EdgeInsets.all(16),
            itemCount: value.length,
            separatorBuilder: (_, _) => const SizedBox(height: 12),
            itemBuilder: (context, i) => ProviderCard(provider: value[i]),
          ),
        AsyncError() =>
          ErrorRetry(onRetry: () => ref.invalidate(favoriteProvidersProvider)),
        _ => const Center(child: CircularProgressIndicator()),
      },
    );
  }
}
