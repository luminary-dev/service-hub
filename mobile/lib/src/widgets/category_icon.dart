import 'package:flutter/widgets.dart';
import 'package:font_awesome_flutter/font_awesome_flutter.dart';

/// Category → FontAwesome icon, mirroring the web's `categoryIcon()` map in
/// `src/lib/constants.ts`. The web renders the same FontAwesome-solid glyphs,
/// so this keeps the two surfaces visually identical. Unknown slugs fall back
/// to the screwdriver-wrench "tools" default, exactly like the web.
const Map<String, FaIconData> _categoryIcons = {
  'mechanic': FontAwesomeIcons.wrench,
  'electrician': FontAwesomeIcons.bolt,
  'plumber': FontAwesomeIcons.shower,
  'carpenter': FontAwesomeIcons.hammer,
  'mason': FontAwesomeIcons.trowel,
  'painter': FontAwesomeIcons.paintRoller,
  'garden-designer': FontAwesomeIcons.leaf,
  'ac-repair': FontAwesomeIcons.snowflake,
  'appliance-repair': FontAwesomeIcons.plug,
  'welder': FontAwesomeIcons.fire,
  'roofer': FontAwesomeIcons.houseChimney,
  'tile-layer': FontAwesomeIcons.borderAll,
  'cctv-security': FontAwesomeIcons.video,
  'pest-control': FontAwesomeIcons.bug,
  'cleaning': FontAwesomeIcons.broom,
  'movers': FontAwesomeIcons.truck,
};

FaIconData categoryIconData(String slug) =>
    _categoryIcons[slug] ?? FontAwesomeIcons.screwdriverWrench;

class CategoryIcon extends StatelessWidget {
  const CategoryIcon({super.key, required this.slug, this.size = 20, this.color});

  final String slug;
  final double size;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    return FaIcon(categoryIconData(slug), size: size, color: color);
  }
}
