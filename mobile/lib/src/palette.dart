import 'package:flutter/material.dart';

/// The web app's design tokens (src/app/globals.css), converted from oklch to
/// sRGB. Two ramps drive everything: **brand** (safety-orange, hi-vis) and
/// **ink** (cool steel/graphite neutrals), plus a `surface`. Both have a dark
/// variant. Semantic roles mirror the web's comments:
///   brand-700 = solid fill (buttons); brand-600 = links/icons;
///   brand-50/100 = soft tints behind chips/badges.
///   ink-50 = page background; ink-200/300 = borders; ink-500/600 = muted body;
///   ink-900 = primary text.
class Ramp {
  const Ramp({
    required this.c50,
    required this.c100,
    required this.c200,
    required this.c300,
    required this.c400,
    required this.c500,
    required this.c600,
    required this.c700,
    required this.c800,
    required this.c900,
  });

  final Color c50, c100, c200, c300, c400, c500, c600, c700, c800, c900;
}

class Palette {
  const Palette({
    required this.brand,
    required this.ink,
    required this.surface,
    required this.emerald,
    required this.amber,
    required this.red,
    required this.brightness,
  });

  final Ramp brand;
  final Ramp ink;
  final Color surface;
  final Color emerald; // success (available badge)
  final Color amber; // rating stars / caution
  final Color red; // favorite heart / destructive
  final Brightness brightness;

  /// Text/icon colour on a solid brand fill. In dark mode the bright brand
  /// carries dark text (#101319); in light mode it carries white.
  Color get onBrand =>
      brightness == Brightness.dark ? ink.c50 : const Color(0xFFFFFFFF);

  static const light = Palette(
    brightness: Brightness.light,
    surface: Color(0xFFFFFFFF),
    emerald: Color(0xFF009965),
    amber: Color(0xFFF49F1E),
    red: Color(0xFFE7000F),
    brand: Ramp(
      c50: Color(0xFFFFEDDF),
      c100: Color(0xFFFFDAC1),
      c200: Color(0xFFFFB88F),
      c300: Color(0xFFFC9662),
      c400: Color(0xFFF77A3C),
      c500: Color(0xFFEE6114),
      c600: Color(0xFFE35400),
      c700: Color(0xFFD74C00),
      c800: Color(0xFFA83A00),
      c900: Color(0xFF832E09),
    ),
    ink: Ramp(
      c50: Color(0xFFF6F7F8),
      c100: Color(0xFFEEF0F3),
      c200: Color(0xFFDDE0E4),
      c300: Color(0xFFCDD1D6),
      c400: Color(0xFF9BA0A8),
      c500: Color(0xFF71767E),
      c600: Color(0xFF545961),
      c700: Color(0xFF3E434C),
      c800: Color(0xFF282C34),
      c900: Color(0xFF161921),
    ),
  );

  static const dark = Palette(
    brightness: Brightness.dark,
    surface: Color(0xFF1F232A),
    emerald: Color(0xFF35D399),
    amber: Color(0xFFF0B846),
    red: Color(0xFFF6685E),
    brand: Ramp(
      c50: Color(0xFF432010),
      c100: Color(0xFF5C2A15),
      c200: Color(0xFF803717),
      c300: Color(0xFFB64C1B),
      c400: Color(0xFFE96326),
      c500: Color(0xFFFF742B),
      c600: Color(0xFFFF8136),
      c700: Color(0xFFFF742B),
      c800: Color(0xFFFF9D62),
      c900: Color(0xFFFFCDAA),
    ),
    // Dark ink ramp INVERTS: 50 stays "page background" (darkest), 900 stays
    // "primary text" (lightest).
    ink: Ramp(
      c50: Color(0xFF101319),
      c100: Color(0xFF262A32),
      c200: Color(0xFF353941),
      c300: Color(0xFF464B53),
      c400: Color(0xFF6A6F77),
      c500: Color(0xFF8D939A),
      c600: Color(0xFFA9AEB5),
      c700: Color(0xFFC2C6CB),
      c800: Color(0xFFD8DBDF),
      c900: Color(0xFFECEFF1),
    ),
  );
}

/// Lets widgets read the active palette off the theme via `context.palette`.
class PaletteTheme extends ThemeExtension<PaletteTheme> {
  const PaletteTheme(this.palette);
  final Palette palette;

  @override
  PaletteTheme copyWith({Palette? palette}) => PaletteTheme(palette ?? this.palette);

  @override
  PaletteTheme lerp(covariant ThemeExtension<PaletteTheme>? other, double t) => this;
}

extension PaletteContext on BuildContext {
  Palette get palette =>
      Theme.of(this).extension<PaletteTheme>()?.palette ?? Palette.light;
}
