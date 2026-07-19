import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../palette.dart';
import '../theme.dart';

/// The web's LoadingBrand visual, ported: the "B" logomark inside two
/// counter-rotating dashed technical dial rings — an "active machinery" read
/// rather than a plain spinner. Used for full-screen loading states.
class BrandLoader extends StatefulWidget {
  const BrandLoader({super.key, this.size = 96});

  final double size;

  @override
  State<BrandLoader> createState() => _BrandLoaderState();
}

class _BrandLoaderState extends State<BrandLoader>
    with TickerProviderStateMixin {
  late final _spin = AnimationController(
    vsync: this,
    duration: const Duration(seconds: 8),
  )..repeat();
  late final _pulse = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1600),
  )..repeat(reverse: true);

  @override
  void dispose() {
    _spin.dispose();
    _pulse.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    return SizedBox(
      width: widget.size,
      height: widget.size,
      child: Stack(
        alignment: Alignment.center,
        children: [
          // Outer ring — clockwise.
          AnimatedBuilder(
            animation: _spin,
            builder: (_, _) => Transform.rotate(
              angle: _spin.value * 2 * math.pi,
              child: CustomPaint(
                size: Size.square(widget.size),
                painter: _RingPainter(color: p.ink.c300, dash: 3, gap: 7, width: 1.5),
              ),
            ),
          ),
          // Inner ring — counter-clockwise.
          AnimatedBuilder(
            animation: _spin,
            builder: (_, _) => Transform.rotate(
              angle: -_spin.value * 2 * math.pi,
              child: CustomPaint(
                size: Size.square(widget.size - 20),
                painter: _RingPainter(color: p.brand.c300, dash: 12, gap: 16, width: 2),
              ),
            ),
          ),
          // Logomark + pulsing brand dot.
          Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 34,
                height: 34,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: p.brand.c700,
                  borderRadius: BorderRadius.circular(7),
                ),
                child: Text('B',
                    style: TextStyle(
                      fontFamily: kFontSans,
                      fontSize: 19,
                      fontWeight: FontWeight.w700,
                      height: 1,
                      color: p.brightness == Brightness.dark
                          ? p.ink.c50
                          : Colors.white,
                    )),
              ),
              const SizedBox(height: 8),
              FadeTransition(
                opacity: Tween(begin: 0.3, end: 1.0).animate(_pulse),
                child: Container(
                  width: 6,
                  height: 6,
                  decoration:
                      BoxDecoration(color: p.brand.c600, shape: BoxShape.circle),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _RingPainter extends CustomPainter {
  _RingPainter({
    required this.color,
    required this.dash,
    required this.gap,
    required this.width,
  });

  final Color color;
  final double dash, gap, width;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = width;
    final r = size.width / 2 - width;
    final c = Offset(size.width / 2, size.height / 2);
    final circumference = 2 * math.pi * r;
    final step = dash + gap;
    final n = (circumference / step).floor();
    for (var i = 0; i < n; i++) {
      final start = (i * step) / r;
      final sweep = dash / r;
      canvas.drawArc(
          Rect.fromCircle(center: c, radius: r), start, sweep, false, paint);
    }
  }

  @override
  bool shouldRepaint(_RingPainter old) => old.color != color;
}

/// Convenience: the loader centered on the page, for full-screen waits.
class BrandLoaderCentered extends StatelessWidget {
  const BrandLoaderCentered({super.key});

  @override
  Widget build(BuildContext context) => const Center(child: BrandLoader());
}
