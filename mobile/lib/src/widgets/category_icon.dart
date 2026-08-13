import 'package:flutter/widgets.dart';

import 'app_icon.dart';

/// Category → icon, mirroring the web's `categoryIcon()` map in
/// `src/lib/constants.ts`. Uses the ported web icon set ([AppIcons]) so the two
/// surfaces render the same glyphs. Unknown slugs fall back to the
/// screwdriver-wrench "tools" default, exactly like the web.
const Map<String, AppIcons> _categoryIcons = {
  'mechanic': AppIcons.wrench,
  'electrician': AppIcons.bolt,
  'plumber': AppIcons.shower,
  'carpenter': AppIcons.hammer,
  'mason': AppIcons.trowel,
  'painter': AppIcons.paintRoller,
  'garden-designer': AppIcons.leaf,
  'ac-repair': AppIcons.snowflake,
  'appliance-repair': AppIcons.plug,
  'welder': AppIcons.fire,
  'roofer': AppIcons.houseChimney,
  'tile-layer': AppIcons.borderAll,
  'cctv-security': AppIcons.video,
  'pest-control': AppIcons.bug,
  'cleaning': AppIcons.broom,
  'movers': AppIcons.truck,
};

AppIcons categoryAppIcon(String slug) =>
    _categoryIcons[slug] ?? AppIcons.screwdriverWrench;

class CategoryIcon extends StatelessWidget {
  const CategoryIcon({super.key, required this.slug, this.size = 20, this.color});

  final String slug;
  final double size;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    return AppIcon(categoryAppIcon(slug), size: size, color: color);
  }
}
