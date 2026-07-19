import 'package:baas_mobile/l10n/gen/app_localizations.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:font_awesome_flutter/font_awesome_flutter.dart';
import 'package:go_router/go_router.dart';

import '../../models/models.dart';
import '../../palette.dart';
import '../../state/providers.dart';
import '../../tv/tv_chrome.dart';
import '../../tv/tv_widgets.dart';
import '../../widgets/brand_loader.dart';
import '../../widgets/common.dart';

/// Top-rated providers for the hero + "Top rated near you" shelf.
final _homeProvidersProvider = FutureProvider.autoDispose<ProviderPage>(
    (ref) => ref.watch(marketplaceApiProvider).browse(sort: 'rating'));

/// TV-style Home: a cinematic featured-provider hero, a search entry, and
/// horizontal shelves (Browse by trade, Top rated near you). Content scrolls
/// full-bleed behind the frosted header and floating tab bar.
class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final p = context.palette;
    final categories = ref.watch(categoriesProvider).value ?? const [];
    final page = ref.watch(_homeProvidersProvider);

    return switch (page) {
      AsyncData(:final value) when value.providers.isNotEmpty =>
        _HomeBody(providers: value.providers, categories: categories),
      AsyncError() => Center(
          child: ErrorRetry(
              onRetry: () => ref.invalidate(_homeProvidersProvider))),
      AsyncData() => Center(
          child: Text(l10n.noProvidersFound,
              style: TextStyle(color: p.ink.c500))),
      _ => const BrandLoaderCentered(),
    };
  }
}

class _HomeBody extends ConsumerWidget {
  const _HomeBody({required this.providers, required this.categories});

  final List<ProviderSummary> providers;
  final List<CategoryOption> categories;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final p = context.palette;
    final favorites = ref.watch(favoritesControllerProvider).value ?? {};
    final featured = providers.first;
    final topRated = providers.take(8).toList();

    void openProvider(String id) => context.push('/providers/$id');
    void openResults([String? category]) => context.push(
        Uri(path: '/results', queryParameters: {
          if (category != null) 'category': category,
        }).toString());

    return Stack(
      children: [
        ListView(
          padding: EdgeInsets.zero,
          children: [
        CinematicHero(
          provider: featured,
          favorited: favorites.contains(featured.id),
          onOpen: () => openProvider(featured.id),
          onFavorite: () => ref
              .read(favoritesControllerProvider.notifier)
              .toggle(featured.id),
        ),
        // Search entry (a pill that opens the results/search screen).
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 16, 20, 0),
          child: GestureDetector(
            onTap: () => openResults(),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 13),
              decoration: BoxDecoration(
                color: p.surface,
                borderRadius: BorderRadius.circular(999),
                border: Border.all(color: p.ink.c200),
              ),
              child: Row(children: [
                FaIcon(FontAwesomeIcons.magnifyingGlass,
                    size: 14, color: p.ink.c400),
                const SizedBox(width: 10),
                Text(l10n.searchHint,
                    style: TextStyle(fontSize: 15, color: p.ink.c400)),
              ]),
            ),
          ),
        ),
        // Browse by trade shelf.
        if (categories.isNotEmpty) ...[
          ShelfHeader(
            title: l10n.shelfBrowseByTrade,
            action: 'ALL ${categories.length}',
            onAction: openResults,
          ),
          SizedBox(
            height: 176,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 20),
              itemCount: categories.length,
              separatorBuilder: (_, _) => const SizedBox(width: 12),
              itemBuilder: (_, i) => TradeTile(
                category: categories[i],
                index: i,
                onTap: () => openResults(categories[i].slug),
              ),
            ),
          ),
        ],
        // Top rated shelf.
        ShelfHeader(
          title: l10n.shelfTopRated,
          action: 'SEE ALL',
          onAction: openResults,
        ),
        SizedBox(
          height: 200,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 20),
            itemCount: topRated.length,
            separatorBuilder: (_, _) => const SizedBox(width: 14),
            itemBuilder: (_, i) => ProCard(
              provider: topRated[i],
              onTap: () => openProvider(topRated[i].id),
            ),
          ),
        ),
        // Clear the floating tab bar.
        const SizedBox(height: 110),
          ],
        ),
        // Frosted chrome over the hero.
        Positioned(
          top: 0,
          left: 0,
          right: 0,
          child: FrostedHeader(
            overHero: true,
            onBell: () => context.go('/notifications'),
          ),
        ),
      ],
    );
  }
}
