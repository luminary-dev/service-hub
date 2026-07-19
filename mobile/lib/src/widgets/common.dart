import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:baas_mobile/l10n/gen/app_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:font_awesome_flutter/font_awesome_flutter.dart';
import 'package:go_router/go_router.dart';

import '../config.dart';
import '../models/models.dart';
import '../palette.dart';
import '../state/providers.dart';
import 'category_icon.dart';

/// Resolves a media URL from the API to something loadable.
///
/// Two kinds of relative paths come back:
///  - `/api/files/...` — real uploads, served by the gateway (media-service).
///  - `/uploads/...`   — demo/seed static assets, served by the Next.js web
///    app's `public/` dir (the gateway does not serve these).
/// Absolute URLs pass through untouched.
String resolveMediaUrl(String url) {
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  if (url.startsWith('/uploads/')) return '${AppConfig.webBaseUrl}$url';
  if (url.startsWith('/')) return '${AppConfig.gatewayBaseUrl}$url';
  return url;
}

class ErrorRetry extends StatelessWidget {
  const ErrorRetry({super.key, required this.onRetry});

  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(l10n.genericError),
          const SizedBox(height: 12),
          OutlinedButton(onPressed: onRetry, child: Text(l10n.retry)),
        ],
      ),
    );
  }
}

class EmptyState extends StatelessWidget {
  const EmptyState({super.key, required this.message, this.icon = Icons.inbox});

  final String message;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 48, color: Theme.of(context).colorScheme.outline),
            const SizedBox(height: 12),
            Text(message, textAlign: TextAlign.center),
          ],
        ),
      ),
    );
  }
}

class RatingStars extends StatelessWidget {
  const RatingStars({super.key, required this.rating, this.size = 16});

  final double rating;
  final double size;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        for (var i = 1; i <= 5; i++)
          Padding(
            padding: const EdgeInsets.only(right: 1.5),
            child: FaIcon(
              FontAwesomeIcons.solidStar,
              size: size,
              color: i <= rating.round() ? p.amber : p.ink.c300,
            ),
          ),
      ],
    );
  }
}

class ProviderCard extends ConsumerWidget {
  const ProviderCard({super.key, required this.provider});

  final ProviderSummary provider;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final p = context.palette;
    final locale = Localizations.localeOf(context).languageCode;
    final favorites = ref.watch(favoritesControllerProvider).value ?? {};
    final signedIn = ref.watch(authControllerProvider).value != null;
    final headline = locale == 'si' && provider.headlineSi?.isNotEmpty == true
        ? provider.headlineSi!
        : provider.headline;
    return Card(
      child: InkWell(
        onTap: () => context.push('/providers/${provider.id}'),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            AspectRatio(
              aspectRatio: 16 / 9,
              child: provider.imageUrl != null
                  ? CachedNetworkImage(
                      imageUrl: resolveMediaUrl(provider.imageUrl!),
                      fit: BoxFit.cover,
                      errorWidget: (_, _, _) => _CategoryPlaceholder(
                          slug: provider.category, p: p),
                      placeholder: (_, _) => ColoredBox(color: p.ink.c100),
                    )
                  // No cover: the trade icon on a tinted panel, like the web.
                  : _CategoryPlaceholder(slug: provider.category, p: p),
            ),
            Padding(
              padding: const EdgeInsets.all(12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          provider.name,
                          style: Theme.of(context).textTheme.titleMedium,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      if (provider.verificationStatus == 'APPROVED')
                        Tooltip(
                          message: l10n.verifiedBadge,
                          child: FaIcon(FontAwesomeIcons.solidCircleCheck,
                              size: 16, color: p.emerald),
                        ),
                      if (signedIn)
                        IconButton(
                          visualDensity: VisualDensity.compact,
                          icon: FaIcon(
                            favorites.contains(provider.id)
                                ? FontAwesomeIcons.solidHeart
                                : FontAwesomeIcons.heart,
                            size: 18,
                            color: p.red,
                          ),
                          onPressed: () => ref
                              .read(favoritesControllerProvider.notifier)
                              .toggle(provider.id),
                        ),
                    ],
                  ),
                  if (headline.isNotEmpty)
                    Text(headline,
                        maxLines: 1, overflow: TextOverflow.ellipsis),
                  const SizedBox(height: 6),
                  Wrap(
                    spacing: 12,
                    runSpacing: 4,
                    crossAxisAlignment: WrapCrossAlignment.center,
                    children: [
                      if (provider.rating != null)
                        Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            RatingStars(rating: provider.rating!),
                            const SizedBox(width: 4),
                            Text(l10n.reviewsCount(provider.reviewCount),
                                style: Theme.of(context).textTheme.bodySmall),
                          ],
                        ),
                      Text(
                        '${provider.city.isNotEmpty ? '${provider.city}, ' : ''}${provider.district}',
                        style: Theme.of(context).textTheme.bodySmall,
                      ),
                      if (provider.distanceKm != null)
                        Text(
                          l10n.distanceAway(
                              provider.distanceKm!.toStringAsFixed(1)),
                          style: Theme.of(context).textTheme.bodySmall,
                        ),
                      if (provider.fromPrice != null)
                        Text(
                          l10n.fromPrice('${provider.fromPrice}'),
                          style: Theme.of(context)
                              .textTheme
                              .bodySmall
                              ?.copyWith(fontWeight: FontWeight.w600),
                        ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// The trade icon on a soft brand-tinted panel — the card/detail fallback when
/// a provider has no cover photo (mirrors the web's CategoryIcon placeholder).
class _CategoryPlaceholder extends StatelessWidget {
  const _CategoryPlaceholder({required this.slug, required this.p});

  final String slug;
  final Palette p;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [p.brand.c50, p.ink.c100],
        ),
      ),
      child: Center(
        child: CategoryIcon(slug: slug, size: 40, color: p.ink.c400),
      ),
    );
  }
}

/// In-content page heading — the web puts section titles in the page body (the
/// header is global), so mobile branch screens do the same instead of an
/// app-bar title. Optional trailing action (e.g. "Mark all read").
class PageHeading extends StatelessWidget {
  const PageHeading({super.key, required this.title, this.trailing});

  final String title;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 16, 8, 8),
      child: Row(
        children: [
          Expanded(
            child: Text(title, style: Theme.of(context).textTheme.headlineSmall),
          ),
          if (trailing != null) trailing!,
        ],
      ),
    );
  }
}
