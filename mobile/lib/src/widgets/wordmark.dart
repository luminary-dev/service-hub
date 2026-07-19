import 'package:flutter/material.dart';

import '../palette.dart';
import '../theme.dart';

/// The Baas.lk logomark + wordmark, matching the web header (Navbar.tsx):
/// a brand-orange rounded square with a bold white "B", then "Baas" in ink
/// with ".lk" in brand orange, all in IBM Plex Sans (the web's font-display).
class Wordmark extends StatelessWidget {
  const Wordmark({super.key, this.compact = false});

  /// When true, renders just the "B" mark (e.g. tight spaces).
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    final mark = Container(
      width: 30,
      height: 30,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: p.brand.c700,
        borderRadius: BorderRadius.circular(6),
      ),
      child: Text(
        'B',
        style: TextStyle(
          fontFamily: kFontSans,
          fontSize: 17,
          fontWeight: FontWeight.w700,
          height: 1,
          color: p.brightness == Brightness.dark ? p.ink.c50 : Colors.white,
        ),
      ),
    );
    if (compact) return mark;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        mark,
        const SizedBox(width: 9),
        Text.rich(
          TextSpan(
            style: TextStyle(
              fontFamily: kFontSans,
              fontSize: 19,
              fontWeight: FontWeight.w700,
              letterSpacing: -0.3,
              color: p.ink.c900,
            ),
            children: [
              const TextSpan(text: 'Baas'),
              TextSpan(text: '.lk', style: TextStyle(color: p.brand.c600)),
            ],
          ),
        ),
      ],
    );
  }
}
