import 'package:flutter/material.dart';

import 'palette.dart';

/// Font families, self-hosted as bundled assets (see pubspec) so they render
/// exactly like the web's next/font setup — no runtime fetch, no fallback.
const kFontSans = 'IBM Plex Sans';
const kFontMono = 'IBM Plex Mono';
const kFontSinhala = 'Noto Sans Sinhala';

// Noto Sans Sinhala carries the Sinhala glyphs; listing it as a fallback on
// every style lets one text run mix Latin + Sinhala (IBM Plex Sans has no
// Sinhala coverage), matching the web's `--font-sans` stack.
const _fallback = [kFontSinhala];

/// Builds the app theme from the web design system (src/app/globals.css):
/// IBM Plex Sans + Noto Sans Sinhala, the safety-orange brand ramp, steel-ink
/// neutrals, and the web's radii / borders / chip styles.
ThemeData buildTheme(Palette p) {
  final isDark = p.brightness == Brightness.dark;
  final base = isDark
      ? ThemeData.dark(useMaterial3: true)
      : ThemeData.light(useMaterial3: true);

  TextStyle sans(double size, FontWeight weight, {Color? color, double? spacing}) =>
      TextStyle(
        fontFamily: kFontSans,
        fontFamilyFallback: _fallback,
        fontSize: size,
        fontWeight: weight,
        letterSpacing: spacing,
        color: color ?? p.ink.c900,
      );

  final textTheme = TextTheme(
    displayLarge: sans(40, FontWeight.w700, spacing: -0.5),
    displayMedium: sans(32, FontWeight.w700, spacing: -0.5),
    displaySmall: sans(28, FontWeight.w700, spacing: -0.3),
    headlineMedium: sans(24, FontWeight.w700, spacing: -0.3),
    headlineSmall: sans(20, FontWeight.w700),
    titleLarge: sans(18, FontWeight.w600),
    titleMedium: sans(16, FontWeight.w600),
    titleSmall: sans(14, FontWeight.w600),
    bodyLarge: sans(16, FontWeight.w400),
    bodyMedium: sans(14, FontWeight.w400),
    bodySmall: sans(12.5, FontWeight.w400, color: p.ink.c500),
    labelLarge: sans(14, FontWeight.w600),
    labelMedium: sans(12, FontWeight.w500),
    labelSmall: sans(11, FontWeight.w500, color: p.ink.c500),
  );

  final scheme = ColorScheme(
    brightness: p.brightness,
    primary: p.brand.c700,
    onPrimary: isDark ? p.ink.c50 : Colors.white,
    primaryContainer: p.brand.c50,
    onPrimaryContainer: p.brand.c800,
    secondary: p.ink.c700,
    onSecondary: isDark ? p.ink.c50 : Colors.white,
    surface: p.surface,
    onSurface: p.ink.c900,
    surfaceContainerHighest: p.ink.c100,
    outline: p.ink.c200,
    outlineVariant: p.ink.c200,
    error: p.red,
    onError: Colors.white,
  );

  return base.copyWith(
    colorScheme: scheme,
    scaffoldBackgroundColor: p.ink.c50, // page background = ink-50
    textTheme: textTheme,
    primaryTextTheme: textTheme,
    extensions: [PaletteTheme(p)],
    appBarTheme: AppBarTheme(
      backgroundColor: p.ink.c50.withValues(alpha: 0.9),
      foregroundColor: p.ink.c900,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      scrolledUnderElevation: 0,
      centerTitle: false,
      titleTextStyle: sans(18, FontWeight.w700),
      shape: Border(bottom: BorderSide(color: p.ink.c300)),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: p.surface,
      hintStyle: TextStyle(color: p.ink.c400),
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: BorderSide(color: p.ink.c200),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: BorderSide(color: p.ink.c200),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: BorderSide(color: p.brand.c600, width: 2),
      ),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: p.brand.c700,
        foregroundColor: isDark ? p.ink.c50 : Colors.white,
        disabledBackgroundColor: p.ink.c200,
        minimumSize: const Size.fromHeight(50),
        textStyle: sans(15, FontWeight.w600),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(999)),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: p.ink.c800,
        side: BorderSide(color: p.ink.c200),
        minimumSize: const Size.fromHeight(50),
        textStyle: sans(15, FontWeight.w600),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(999)),
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(
        foregroundColor: p.brand.c700,
        textStyle: sans(14, FontWeight.w600, color: p.brand.c700),
      ),
    ),
    cardTheme: CardThemeData(
      color: p.surface,
      elevation: 0,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16), // rounded-2xl
        side: BorderSide(color: p.ink.c200),
      ),
      clipBehavior: Clip.antiAlias,
    ),
    chipTheme: ChipThemeData(
      backgroundColor: p.surface,
      selectedColor: p.brand.c50,
      side: BorderSide(color: p.ink.c200),
      labelStyle: sans(13, FontWeight.w500, color: p.ink.c700),
      secondaryLabelStyle: sans(13, FontWeight.w600, color: p.brand.c800),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(999)),
      showCheckmark: false,
    ),
    dividerTheme: DividerThemeData(color: p.ink.c200, thickness: 1),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: p.surface,
      surfaceTintColor: Colors.transparent,
      indicatorColor: p.brand.c50,
      elevation: 3,
      labelTextStyle: WidgetStateProperty.resolveWith(
        (states) => sans(
          11.5,
          FontWeight.w600,
          color: states.contains(WidgetState.selected)
              ? p.brand.c800
              : p.ink.c500,
        ),
      ),
      iconTheme: WidgetStateProperty.resolveWith(
        (states) => IconThemeData(
          color: states.contains(WidgetState.selected)
              ? p.brand.c700
              : p.ink.c500,
        ),
      ),
    ),
    snackBarTheme: SnackBarThemeData(
      backgroundColor: p.ink.c900,
      contentTextStyle: sans(14, FontWeight.w400, color: p.ink.c50),
      behavior: SnackBarBehavior.floating,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
    ),
    bottomSheetTheme: BottomSheetThemeData(
      backgroundColor: p.surface,
      surfaceTintColor: Colors.transparent,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
    ),
  );
}
