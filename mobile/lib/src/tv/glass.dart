import 'dart:ui';

import 'package:flutter/material.dart';

import '../palette.dart';

/// Frosted "glass chrome" surface used across the TV-style redesign — a
/// blurred, translucent, hairline-bordered panel (the floating tab bar, header
/// chrome, glass buttons, chat input). Tints from the palette so it works in
/// both dark and light.
class GlassPanel extends StatelessWidget {
  const GlassPanel({
    super.key,
    required this.child,
    this.borderRadius,
    this.blur = 20,
    this.opacity = 0.72,
    this.border = true,
    this.tint,
  });

  final Widget child;
  final BorderRadius? borderRadius;
  final double blur;
  final double opacity;
  final bool border;
  final Color? tint;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    final radius = borderRadius ?? BorderRadius.circular(999);
    final glass = (tint ?? _glassBase(p)).withValues(alpha: opacity);
    return ClipRRect(
      borderRadius: radius,
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: blur, sigmaY: blur),
        child: DecoratedBox(
          decoration: BoxDecoration(
            color: glass,
            borderRadius: radius,
            border: border
                ? Border.all(
                    color: p.brightness == Brightness.dark
                        ? Colors.white.withValues(alpha: 0.08)
                        : Colors.black.withValues(alpha: 0.06),
                  )
                : null,
          ),
          child: child,
        ),
      ),
    );
  }

  static Color _glassBase(Palette p) =>
      p.brightness == Brightness.dark ? const Color(0xFF1F232A) : Colors.white;
}

/// A round glass icon button (the hero heart, the detail back/heart chrome).
class GlassIconButton extends StatelessWidget {
  const GlassIconButton({
    super.key,
    required this.child,
    required this.onTap,
    this.size = 40,
  });

  final Widget child;
  final VoidCallback onTap;
  final double size;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: GlassPanel(
        opacity: 0.5,
        blur: 14,
        border: false,
        child: SizedBox(width: size, height: size, child: Center(child: child)),
      ),
    );
  }
}
