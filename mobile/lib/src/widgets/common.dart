import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:baas_mobile/l10n/gen/app_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../config.dart';
import '../models/models.dart';
import '../state/providers.dart';

/// Media URLs come back gateway-relative (`/api/files/...`).
String resolveMediaUrl(String url) =>
    url.startsWith('/') ? '${AppConfig.gatewayBaseUrl}$url' : url;

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
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        for (var i = 1; i <= 5; i++)
          Icon(
            i <= rating.round() ? Icons.star : Icons.star_border,
            size: size,
            color: const Color(0xFFF59E0B),
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
            if (provider.imageUrl != null)
              AspectRatio(
                aspectRatio: 16 / 9,
                child: CachedNetworkImage(
                  imageUrl: resolveMediaUrl(provider.imageUrl!),
                  fit: BoxFit.cover,
                  errorWidget: (_, _, _) =>
                      const ColoredBox(color: Color(0xFFF1F5F9)),
                ),
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
                          child: const Icon(Icons.verified,
                              size: 18, color: Color(0xFF0284C7)),
                        ),
                      if (signedIn)
                        IconButton(
                          visualDensity: VisualDensity.compact,
                          icon: Icon(
                            favorites.contains(provider.id)
                                ? Icons.favorite
                                : Icons.favorite_border,
                            size: 20,
                            color: const Color(0xFFDC2626),
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
