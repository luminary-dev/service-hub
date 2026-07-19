import 'package:baas_mobile/l10n/gen/app_localizations.dart';
import 'package:flutter/material.dart';

import '../palette.dart';
import '../theme.dart';

/// The homepage hero, adapted for mobile from the web landing page: a
/// brand-tinted panel with a mono "spec marker" kicker, a bold display
/// headline, and a subtitle — with a fade-and-rise entrance animation matching
/// the web's heroRise motion.
class HomeHero extends StatefulWidget {
  const HomeHero({super.key});

  @override
  State<HomeHero> createState() => _HomeHeroState();
}

class _HomeHeroState extends State<HomeHero> with SingleTickerProviderStateMixin {
  late final _controller = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 650),
  )..forward();

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final p = context.palette;
    final rise = CurvedAnimation(parent: _controller, curve: Curves.easeOutCubic);

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(16, 24, 16, 24),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [p.brand.c50, p.ink.c50],
        ),
        border: Border(bottom: BorderSide(color: p.ink.c200)),
      ),
      child: FadeTransition(
        opacity: _controller,
        child: SlideTransition(
          position:
              Tween(begin: const Offset(0, 0.12), end: Offset.zero).animate(rise),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Mono spec-marker kicker (house style from the web).
              Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                    decoration: BoxDecoration(
                      color: p.brand.c700,
                      borderRadius: BorderRadius.circular(3),
                    ),
                    child: Text(
                      l10n.heroKicker,
                      style: TextStyle(
                        fontFamily: kFontMono,
                        fontSize: 10,
                        fontWeight: FontWeight.w600,
                        letterSpacing: 1.2,
                        color: p.brightness == Brightness.dark
                            ? p.ink.c50
                            : Colors.white,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 14),
              Text(
                l10n.heroTitle,
                style: TextStyle(
                  fontFamily: kFontSans,
                  fontSize: 28,
                  height: 1.12,
                  fontWeight: FontWeight.w700,
                  letterSpacing: -0.5,
                  color: p.ink.c900,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                l10n.heroSubtitle,
                style: TextStyle(fontSize: 14, height: 1.4, color: p.ink.c600),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
