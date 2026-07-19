import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import 'palette.dart';

/// Builds the app theme from the web design system (src/app/globals.css):
/// IBM Plex Sans for Latin + Noto Sans Sinhala for Sinhala, the safety-orange
/// brand ramp, steel-ink neutrals, and the web's radii/borders/chip styles.
ThemeData buildTheme(Palette p) {
  final isDark = p.brightness == Brightness.dark;

  final base = isDark
      ? ThemeData.dark(useMaterial3: true)
      : ThemeData.light(useMaterial3: true);
  final textTheme = GoogleFonts.ibmPlexSansTextTheme(base.textTheme).apply(
    bodyColor: p.ink.c900,
    displayColor: p.ink.c900,
    fontFamilyFallback: [GoogleFonts.notoSansSinhala().fontFamily!],
  );

  final scheme = ColorScheme(
    brightness: p.brightness,
    primary: p.brand.c700, // solid fill
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
    extensions: [PaletteTheme(p)],
    appBarTheme: AppBarTheme(
      backgroundColor: p.surface,
      foregroundColor: p.ink.c900,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      scrolledUnderElevation: 0.5,
      centerTitle: false,
      titleTextStyle: GoogleFonts.ibmPlexSans(
        textStyle: TextStyle(
          fontSize: 20,
          fontWeight: FontWeight.w600,
          color: p.ink.c900,
        ),
      ).copyWith(fontFamilyFallback: [GoogleFonts.notoSansSinhala().fontFamily!]),
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
    // Primary buttons: solid brand-700 fill, pill shape (web uses rounded-full),
    // semibold label.
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: p.brand.c700,
        foregroundColor: isDark ? p.ink.c50 : Colors.white,
        disabledBackgroundColor: p.ink.c200,
        minimumSize: const Size.fromHeight(50),
        textStyle: const TextStyle(fontWeight: FontWeight.w600, fontSize: 15),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(999)),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: p.ink.c800,
        side: BorderSide(color: p.ink.c200),
        minimumSize: const Size.fromHeight(50),
        textStyle: const TextStyle(fontWeight: FontWeight.w600, fontSize: 15),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(999)),
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(
        foregroundColor: p.brand.c700,
        textStyle: const TextStyle(fontWeight: FontWeight.w600),
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
      labelStyle: TextStyle(color: p.ink.c700, fontWeight: FontWeight.w500),
      secondaryLabelStyle: TextStyle(color: p.brand.c800),
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
        (states) => TextStyle(
          fontSize: 12,
          fontWeight: FontWeight.w600,
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
      contentTextStyle: TextStyle(color: p.ink.c50),
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
