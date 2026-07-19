import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:font_awesome_flutter/font_awesome_flutter.dart';

import '../models/models.dart';
import '../palette.dart';
import '../theme.dart';
import '../widgets/category_icon.dart';
import '../widgets/common.dart';
import 'glass.dart';

/// The web homepage hero, ported to mobile: a blueprint-grid panel with a
/// `001 / FIND` spec marker, the two-part headline (second half in brand), the
/// subtitle, and a tech-corners search box — the same "technical drawing" look
/// as `src/app/page.tsx`, instead of a featured-provider photo.
class BlueprintHero extends StatelessWidget {
  const BlueprintHero({
    super.key,
    required this.markerLabel,
    required this.title1,
    required this.title2,
    required this.subtitle,
    required this.searchHint,
    required this.onSearch,
  });

  final String markerLabel;
  final String title1;
  final String title2;
  final String subtitle;
  final String searchHint;
  final VoidCallback onSearch;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    final topInset = MediaQuery.paddingOf(context).top;
    return Container(
      color: p.surface,
      child: Stack(
        children: [
          // Blueprint grid, faded so text stays legible.
          Positioned.fill(
            child: CustomPaint(
              painter: _BlueprintGridPainter(
                minor: p.ink.c400.withValues(alpha: 0.12),
                major: p.ink.c400.withValues(alpha: 0.22),
              ),
            ),
          ),
          Padding(
            // Clear the frosted header that floats over the hero.
            padding: EdgeInsets.fromLTRB(20, topInset + 76, 20, 28),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _Marker(code: '001', label: markerLabel, p: p),
                const SizedBox(height: 18),
                Text.rich(
                  TextSpan(children: [
                    TextSpan(text: title1),
                    TextSpan(
                        text: title2, style: TextStyle(color: p.brand.c700)),
                  ]),
                  style: TextStyle(
                    fontFamily: kFontSans,
                    fontSize: 34,
                    height: 1.08,
                    fontWeight: FontWeight.w700,
                    letterSpacing: -0.6,
                    color: p.ink.c900,
                  ),
                ),
                const SizedBox(height: 14),
                Text(
                  subtitle,
                  style: TextStyle(
                    fontFamily: kFontSans,
                    fontSize: 14.5,
                    height: 1.5,
                    color: p.ink.c500,
                  ),
                ),
                const SizedBox(height: 20),
                // tech-corners search box.
                _TechCornerBox(
                  color: p.brand.c700,
                  child: GestureDetector(
                    onTap: onSearch,
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 16, vertical: 15),
                      decoration: BoxDecoration(
                        color: p.surface,
                        border: Border.all(color: p.ink.c300),
                      ),
                      child: Row(children: [
                        FaIcon(FontAwesomeIcons.magnifyingGlass,
                            size: 15, color: p.ink.c400),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Text(searchHint,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(fontSize: 15, color: p.ink.c400)),
                        ),
                        Container(
                          height: 34,
                          padding: const EdgeInsets.symmetric(horizontal: 16),
                          alignment: Alignment.center,
                          decoration: BoxDecoration(
                            color: p.brand.c700,
                            borderRadius: BorderRadius.circular(6),
                          ),
                          child: FaIcon(FontAwesomeIcons.arrowRight,
                              size: 13, color: p.onBrand),
                        ),
                      ]),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// The `001 / FIND` spec marker from the web hero: a brand code chip, an
/// uppercase mono label, and a trailing hairline.
class _Marker extends StatelessWidget {
  const _Marker({required this.code, required this.label, required this.p});

  final String code;
  final String label;
  final Palette p;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
          decoration: BoxDecoration(
            color: p.brand.c700,
            borderRadius: BorderRadius.circular(3),
          ),
          child: Text(code,
              style: TextStyle(
                fontFamily: kFontMono,
                fontSize: 11,
                fontWeight: FontWeight.w600,
                letterSpacing: 1.5,
                color: p.onBrand,
              )),
        ),
        const SizedBox(width: 10),
        Text(label.toUpperCase(),
            style: TextStyle(
              fontFamily: kFontMono,
              fontSize: 11,
              fontWeight: FontWeight.w600,
              letterSpacing: 1.5,
              color: p.ink.c500,
            )),
        const SizedBox(width: 10),
        Expanded(child: Container(height: 1, color: p.ink.c300)),
      ],
    );
  }
}

/// Wraps a child in the web's `tech-corners` brackets: a brand L at the
/// top-left and bottom-right.
class _TechCornerBox extends StatelessWidget {
  const _TechCornerBox({required this.child, required this.color});

  final Widget child;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Stack(
      children: [
        child,
        Positioned(
          top: -3,
          left: -3,
          child: _bracket(top: true, left: true),
        ),
        Positioned(
          bottom: -3,
          right: -3,
          child: _bracket(top: false, left: false),
        ),
      ],
    );
  }

  Widget _bracket({required bool top, required bool left}) {
    const side = BorderSide(width: 2);
    return SizedBox(
      width: 14,
      height: 14,
      child: DecoratedBox(
        decoration: BoxDecoration(
          border: Border(
            top: top ? side.copyWith(color: color) : BorderSide.none,
            bottom: !top ? side.copyWith(color: color) : BorderSide.none,
            left: left ? side.copyWith(color: color) : BorderSide.none,
            right: !left ? side.copyWith(color: color) : BorderSide.none,
          ),
        ),
      ),
    );
  }
}

/// Paints the blueprint grid: 24px minor lines + 120px major lines.
class _BlueprintGridPainter extends CustomPainter {
  _BlueprintGridPainter({required this.minor, required this.major});

  final Color minor;
  final Color major;

  @override
  void paint(Canvas canvas, Size size) {
    void grid(double step, Color color) {
      final paint = Paint()
        ..color = color
        ..strokeWidth = 1;
      for (double x = 0; x <= size.width; x += step) {
        canvas.drawLine(Offset(x, 0), Offset(x, size.height), paint);
      }
      for (double y = 0; y <= size.height; y += step) {
        canvas.drawLine(Offset(0, y), Offset(size.width, y), paint);
      }
    }

    grid(24, minor);
    grid(120, major);
  }

  @override
  bool shouldRepaint(_BlueprintGridPainter old) =>
      old.minor != minor || old.major != major;
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
