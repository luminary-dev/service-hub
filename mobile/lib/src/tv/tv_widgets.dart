import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:font_awesome_flutter/font_awesome_flutter.dart';

import '../models/models.dart';
import '../palette.dart';
import '../theme.dart';
import '../widgets/category_icon.dart';
import '../widgets/common.dart';
import 'glass.dart';

/// Cinematic full-bleed hero for a featured provider (the design's home hero):
/// cover image → gradient fade to background, category chip, big name, a mono
/// rating/price meta line, a View-profile pill + glass heart, and carousel dots.
class CinematicHero extends StatelessWidget {
  const CinematicHero({
    super.key,
    required this.provider,
    required this.onOpen,
    required this.onFavorite,
    this.favorited = false,
    this.dots = 4,
    this.activeDot = 0,
  });

  final ProviderSummary provider;
  final VoidCallback onOpen;
  final VoidCallback onFavorite;
  final bool favorited;
  final int dots;
  final int activeDot;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    final bg = p.ink.c50;
    return SizedBox(
      height: 472,
      child: Stack(
        fit: StackFit.expand,
        children: [
          if (provider.imageUrl != null)
            CachedNetworkImage(
              imageUrl: resolveMediaUrl(provider.imageUrl!),
              fit: BoxFit.cover,
              errorWidget: (_, _, _) => ColoredBox(color: p.ink.c100),
            )
          else
            ColoredBox(color: p.ink.c100),
          // Fade to page background so the shelves sit on solid colour.
          DecoratedBox(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                stops: const [0, 0.30, 0.68, 1],
                colors: [
                  Colors.black.withValues(alpha: 0.35),
                  Colors.transparent,
                  bg.withValues(alpha: 0.55),
                  bg,
                ],
              ),
            ),
          ),
          Positioned(
            left: 20,
            right: 20,
            bottom: 24,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _chip(p, '${provider.category.toUpperCase()} · '
                    '${provider.district.toUpperCase()}'),
                const SizedBox(height: 10),
                Text(
                  provider.name,
                  style: const TextStyle(
                    fontFamily: kFontSans,
                    fontSize: 32,
                    height: 1.08,
                    fontWeight: FontWeight.w700,
                    letterSpacing: -0.5,
                    color: Colors.white,
                    shadows: [
                      Shadow(blurRadius: 16, color: Color(0x73000000)),
                    ],
                  ),
                ),
                const SizedBox(height: 10),
                _metaLine(context, p),
                const SizedBox(height: 14),
                Row(
                  children: [
                    GestureDetector(
                      onTap: onOpen,
                      child: Container(
                        height: 44,
                        padding: const EdgeInsets.symmetric(horizontal: 22),
                        decoration: BoxDecoration(
                          color: p.brand.c700,
                          borderRadius: BorderRadius.circular(999),
                        ),
                        child: Row(children: [
                          FaIcon(FontAwesomeIcons.paperPlane,
                              size: 13, color: p.onBrand),
                          const SizedBox(width: 8),
                          Text('View profile',
                              style: TextStyle(
                                  fontSize: 15,
                                  fontWeight: FontWeight.w600,
                                  color: p.onBrand)),
                        ]),
                      ),
                    ),
                    const SizedBox(width: 10),
                    GlassIconButton(
                      size: 44,
                      onTap: onFavorite,
                      child: FaIcon(
                        favorited
                            ? FontAwesomeIcons.solidHeart
                            : FontAwesomeIcons.heart,
                        size: 17,
                        color: Colors.white,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                Center(child: _dots(p)),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _chip(Palette p, String text) => Align(
        alignment: Alignment.centerLeft,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
          decoration: BoxDecoration(
            color: p.brand.c700,
            borderRadius: BorderRadius.circular(3),
          ),
          child: Text(text,
              style: TextStyle(
                fontFamily: kFontMono,
                fontSize: 10,
                fontWeight: FontWeight.w600,
                letterSpacing: 1.4,
                color: p.onBrand,
              )),
        ),
      );

  Widget _metaLine(BuildContext context, Palette p) {
    final parts = <String>[
      if (provider.rating != null) provider.rating!.toStringAsFixed(1),
      '${provider.reviewCount} REVIEWS',
    ];
    return Row(
      children: [
        FaIcon(FontAwesomeIcons.solidStar, size: 11, color: p.amber),
        const SizedBox(width: 6),
        Flexible(
          child: Text(
            [
              parts.join(' · '),
              if (provider.fromPrice != null) 'FROM RS. ${provider.fromPrice}',
            ].join('   |   '),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
              fontFamily: kFontMono,
              fontSize: 11,
              letterSpacing: 1.2,
              color: Color(0xFFC2C6CB),
            ),
          ),
        ),
      ],
    );
  }

  Widget _dots(Palette p) => Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          for (var i = 0; i < dots; i++)
            Container(
              margin: const EdgeInsets.symmetric(horizontal: 3),
              width: i == activeDot ? 16 : 5,
              height: 5,
              decoration: BoxDecoration(
                color: i == activeDot
                    ? p.brand.c700
                    : Colors.white.withValues(alpha: 0.35),
                borderRadius: BorderRadius.circular(99),
              ),
            ),
        ],
      );
}

/// A "Browse by trade" tile — 132×176, cover image → gradient, mono code +
/// label. Falls back to the category icon on a tinted panel with no image.
class TradeTile extends StatelessWidget {
  const TradeTile({super.key, required this.category, this.index = 0, required this.onTap});

  final CategoryOption category;
  final int index;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    final locale = Localizations.localeOf(context).languageCode;
    return GestureDetector(
      onTap: onTap,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(16),
        child: SizedBox(
          width: 132,
          height: 176,
          child: Stack(
            fit: StackFit.expand,
            children: [
              // Per-category cover (/images/categories/<slug>.jpg), with the
              // trade icon on a tinted panel as the fallback.
              CachedNetworkImage(
                imageUrl: categoryCoverUrl(category.slug),
                fit: BoxFit.cover,
                errorWidget: (_, _, _) => _iconFallback(p),
                placeholder: (_, _) => _iconFallback(p),
              ),
              const DecoratedBox(
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    stops: [0.4, 1],
                    colors: [Colors.transparent, Color(0xE0101319)],
                  ),
                ),
              ),
              Positioned(
                left: 12,
                right: 12,
                bottom: 10,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('TR-${(index + 1).toString().padLeft(2, '0')}',
                        style: TextStyle(
                          fontFamily: kFontMono,
                          fontSize: 9,
                          letterSpacing: 1.3,
                          color: p.brand.c800,
                        )),
                    const SizedBox(height: 2),
                    Text(category.label(locale),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontSize: 14.5,
                          fontWeight: FontWeight.w600,
                          color: Colors.white,
                        )),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _iconFallback(Palette p) => DecoratedBox(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [p.brand.c100, p.ink.c100],
          ),
        ),
        child: Center(
          child: CategoryIcon(slug: category.slug, size: 34, color: p.ink.c500),
        ),
      );
}

/// A "Top rated near you" card — 216 wide, 126px cover with a glass trade tag +
/// availability badge, then name + verified check + mono meta.
class ProCard extends StatelessWidget {
  const ProCard({super.key, required this.provider, required this.onTap});

  final ProviderSummary provider;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    return GestureDetector(
      onTap: onTap,
      child: SizedBox(
        width: 216,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            ClipRRect(
              borderRadius: BorderRadius.circular(16),
              child: SizedBox(
                height: 126,
                child: Stack(
                  fit: StackFit.expand,
                  children: [
                    if (provider.imageUrl != null)
                      CachedNetworkImage(
                        imageUrl: resolveMediaUrl(provider.imageUrl!),
                        fit: BoxFit.cover,
                        errorWidget: (_, _, _) => ColoredBox(color: p.ink.c100),
                      )
                    else
                      ColoredBox(color: p.ink.c100),
                    Positioned(
                      left: 10,
                      top: 10,
                      child: GlassPanel(
                        opacity: 0.62,
                        blur: 8,
                        border: false,
                        child: Padding(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 8, vertical: 3),
                          child: Text(provider.category.toUpperCase(),
                              style: const TextStyle(
                                fontFamily: kFontMono,
                                fontSize: 9,
                                fontWeight: FontWeight.w600,
                                letterSpacing: 1.2,
                                color: Colors.white,
                              )),
                        ),
                      ),
                    ),
                    if (provider.available)
                      Positioned(
                        right: 10,
                        bottom: 10,
                        child: GlassPanel(
                          opacity: 0.62,
                          blur: 8,
                          border: false,
                          child: Padding(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 9, vertical: 4),
                            child: Row(mainAxisSize: MainAxisSize.min, children: [
                              Container(
                                width: 6,
                                height: 6,
                                decoration: BoxDecoration(
                                    color: p.emerald, shape: BoxShape.circle),
                              ),
                              const SizedBox(width: 5),
                              Text('Available',
                                  style: TextStyle(
                                    fontSize: 11,
                                    fontWeight: FontWeight.w600,
                                    color: p.emerald,
                                  )),
                            ]),
                          ),
                        ),
                      ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 9),
            Row(
              children: [
                Expanded(
                  child: Text(provider.name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.w600,
                        color: p.ink.c900,
                      )),
                ),
                if (provider.verificationStatus == 'APPROVED')
                  FaIcon(FontAwesomeIcons.solidCircleCheck,
                      size: 13, color: p.emerald),
              ],
            ),
            const SizedBox(height: 3),
            Row(
              children: [
                FaIcon(FontAwesomeIcons.solidStar, size: 10, color: p.amber),
                const SizedBox(width: 5),
                Flexible(
                  child: Text(
                    [
                      if (provider.rating != null)
                        provider.rating!.toStringAsFixed(1),
                      provider.district.toUpperCase(),
                      if (provider.fromPrice != null) 'RS. ${provider.fromPrice}',
                    ].join(' · '),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      fontFamily: kFontMono,
                      fontSize: 10,
                      letterSpacing: 1,
                      color: p.ink.c500,
                    ),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
