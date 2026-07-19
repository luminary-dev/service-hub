import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:font_awesome_flutter/font_awesome_flutter.dart';

import '../palette.dart';
import '../state/providers.dart';
import '../theme.dart';
import 'glass.dart';

/// Floating glass tab bar (the design's bottom chrome): a blurred pill with 5
/// destinations — icon + mono uppercase label, active in brand. Sits above the
/// home indicator; content scrolls behind it.
class GlassTabBar extends ConsumerWidget {
  const GlassTabBar({super.key, required this.index, required this.onSelect});

  final int index;
  final ValueChanged<int> onSelect;

  static const _items = [
    (FontAwesomeIcons.house, 'BROWSE'),
    (FontAwesomeIcons.briefcase, 'JOBS'),
    (FontAwesomeIcons.solidCommentDots, 'ASSIST'),
    (FontAwesomeIcons.bell, 'ALERTS'),
    (FontAwesomeIcons.user, 'ACCOUNT'),
  ];

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final p = context.palette;
    final unread = ref.watch(unreadCountProvider).value ?? 0;
    return Padding(
      padding: const EdgeInsets.fromLTRB(24, 0, 24, 12),
      child: SafeArea(
        top: false,
        child: GlassPanel(
          opacity: 0.72,
          blur: 20,
          child: SizedBox(
            height: 64,
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceAround,
              children: [
                for (var i = 0; i < _items.length; i++)
                  _Tab(
                    icon: _items[i].$1,
                    label: _items[i].$2,
                    active: i == index,
                    badge: i == 3 ? unread : 0,
                    color: i == index ? p.brand.c600 : p.ink.c500,
                    onTap: () => onSelect(i),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _Tab extends StatelessWidget {
  const _Tab({
    required this.icon,
    required this.label,
    required this.active,
    required this.badge,
    required this.color,
    required this.onTap,
  });

  final FaIconData icon;
  final String label;
  final bool active;
  final int badge;
  final Color color;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(16),
      child: SizedBox(
        width: 58,
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Badge(
              isLabelVisible: badge > 0,
              label: Text('$badge'),
              child: FaIcon(icon, size: 17, color: color),
            ),
            const SizedBox(height: 4),
            Text(
              label,
              style: TextStyle(
                fontFamily: kFontMono,
                fontSize: 8.5,
                fontWeight: FontWeight.w600,
                letterSpacing: 1,
                color: color,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Frosted top chrome that overlays scrolling content — the logomark, the
/// language pill, and a glass bell. Two variants: `gradient` (over a hero image,
/// no blur/border) and solid-frosted (over content, blur + hairline).
class FrostedHeader extends ConsumerWidget implements PreferredSizeWidget {
  const FrostedHeader({
    super.key,
    this.overHero = false,
    this.title,
    this.showBell = true,
    this.showLanguage = true,
    this.onBell,
  });

  final bool overHero;
  final Widget? title;
  final bool showBell;
  final bool showLanguage;
  final VoidCallback? onBell;

  @override
  Size get preferredSize => const Size.fromHeight(70);

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final p = context.palette;
    final locale = ref.watch(localeControllerProvider);
    // Over a hero image everything is light-on-dark regardless of theme.
    final fg = overHero ? Colors.white : p.ink.c900;

    final content = Padding(
      padding: const EdgeInsets.fromLTRB(20, 0, 16, 10),
      child: SafeArea(
        bottom: false,
        child: SizedBox(
          height: 40,
          child: Row(
            children: [
              Container(
                width: 28,
                height: 28,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: p.brand.c700,
                  borderRadius: BorderRadius.circular(6),
                ),
                child: Text('B',
                    style: TextStyle(
                      fontFamily: kFontSans,
                      fontSize: 16,
                      fontWeight: FontWeight.w700,
                      height: 1,
                      color: p.brightness == Brightness.dark
                          ? p.ink.c50
                          : Colors.white,
                    )),
              ),
              const SizedBox(width: 8),
              Text.rich(
                TextSpan(
                  style: TextStyle(
                    fontFamily: kFontSans,
                    fontSize: 18,
                    fontWeight: FontWeight.w700,
                    letterSpacing: -0.3,
                    color: fg,
                  ),
                  children: [
                    const TextSpan(text: 'Baas'),
                    TextSpan(
                        text: '.lk',
                        style: TextStyle(
                            color: overHero ? p.brand.c900 : p.brand.c600)),
                  ],
                ),
              ),
              if (title != null) ...[const SizedBox(width: 12), title!],
              const Spacer(),
              if (showLanguage)
                GestureDetector(
                  onTap: () => ref.read(localeControllerProvider.notifier).set(
                        locale.languageCode == 'si'
                            ? const Locale('en')
                            : const Locale('si'),
                      ),
                  child: GlassPanel(
                    opacity: overHero ? 0.28 : 0.0,
                    blur: overHero ? 12 : 0,
                    border: false,
                    child: Padding(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 12, vertical: 7),
                      child: Text(
                        locale.languageCode == 'si' ? 'EN' : 'සිං',
                        style: TextStyle(
                          fontFamily: kFontMono,
                          fontSize: 11,
                          fontWeight: FontWeight.w600,
                          color: fg,
                        ),
                      ),
                    ),
                  ),
                ),
              if (showBell) ...[
                const SizedBox(width: 8),
                GlassIconButton(
                  size: 32,
                  onTap: onBell ?? () {},
                  child: FaIcon(FontAwesomeIcons.bell, size: 14, color: fg),
                ),
              ],
            ],
          ),
        ),
      ),
    );

    if (overHero) {
      return DecoratedBox(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [
              Colors.black.withValues(alpha: 0.5),
              Colors.transparent,
            ],
          ),
        ),
        child: content,
      );
    }
    return GlassPanel(
      opacity: 0.72,
      blur: 18,
      borderRadius: BorderRadius.zero,
      border: false,
      child: DecoratedBox(
        decoration: BoxDecoration(
          border: Border(
              bottom: BorderSide(
                  color: p.ink.c900.withValues(alpha: 0.07))),
        ),
        child: content,
      ),
    );
  }
}

/// A mono uppercase shelf/section header with an optional trailing action.
class ShelfHeader extends StatelessWidget {
  const ShelfHeader({super.key, required this.title, this.action, this.onAction});

  final String title;
  final String? action;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 24, 20, 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          Expanded(
            child: Text(
              title,
              style: TextStyle(
                fontFamily: kFontSans,
                fontSize: 19,
                fontWeight: FontWeight.w700,
                letterSpacing: -0.3,
                color: p.ink.c900,
              ),
            ),
          ),
          if (action != null)
            GestureDetector(
              onTap: onAction,
              child: Row(
                children: [
                  Text(action!,
                      style: TextStyle(
                        fontFamily: kFontMono,
                        fontSize: 10.5,
                        fontWeight: FontWeight.w600,
                        letterSpacing: 1.3,
                        color: p.brand.c600,
                      )),
                  const SizedBox(width: 5),
                  FaIcon(FontAwesomeIcons.arrowRight,
                      size: 9, color: p.brand.c600),
                ],
              ),
            ),
        ],
      ),
    );
  }
}
