import 'package:flutter/material.dart';

/// Brand palette per docs/DESIGN.md — the web's amber-on-slate marketplace
/// look, kept warm and high-contrast for outdoor phone use.
ThemeData buildTheme() {
  final scheme = ColorScheme.fromSeed(
    seedColor: const Color(0xFFF59E0B), // amber-500
    primary: const Color(0xFFB45309), // amber-700 — AA on white
    surface: Colors.white,
  );
  return ThemeData(
    colorScheme: scheme,
    useMaterial3: true,
    appBarTheme: AppBarTheme(
      backgroundColor: scheme.surface,
      foregroundColor: const Color(0xFF0F172A), // slate-900
      elevation: 0,
      centerTitle: false,
    ),
    inputDecorationTheme: InputDecorationTheme(
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
      filled: true,
      fillColor: const Color(0xFFF8FAFC), // slate-50
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        minimumSize: const Size.fromHeight(48),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
    ),
    cardTheme: CardThemeData(
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: const BorderSide(color: Color(0xFFE2E8F0)), // slate-200
      ),
      clipBehavior: Clip.antiAlias,
    ),
    chipTheme: const ChipThemeData(showCheckmark: false),
  );
}
