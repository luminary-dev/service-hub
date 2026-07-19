import 'package:baas_mobile/l10n/gen/app_localizations.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:font_awesome_flutter/font_awesome_flutter.dart';

import '../palette.dart';
import '../state/providers.dart';

/// Google + Facebook sign-in buttons + an "or" divider, mirroring the web's
/// GoogleSignInButton / FacebookSignInButton on the login and register pages.
class SocialLogin extends ConsumerWidget {
  const SocialLogin({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final p = context.palette;

    Future<void> run(String provider) async {
      final error =
          await ref.read(authControllerProvider.notifier).socialSignIn(provider);
      if (error != null && error != 'cancelled' && context.mounted) {
        final msg = error == 'oauth_unavailable'
            ? l10n.oauthUnavailable
            : l10n.genericError;
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(msg)));
      }
    }

    return Column(
      children: [
        _SocialButton(
          onPressed: () => run('google'),
          icon: const _GoogleG(),
          label: l10n.continueWithGoogle,
        ),
        const SizedBox(height: 12),
        _SocialButton(
          onPressed: () => run('facebook'),
          icon: const FaIcon(FontAwesomeIcons.facebook,
              size: 20, color: Color(0xFF1877F2)),
          label: l10n.continueWithFacebook,
        ),
        const SizedBox(height: 20),
        Row(
          children: [
            Expanded(child: Divider(color: p.ink.c200)),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12),
              child: Text(l10n.orDivider,
                  style: TextStyle(color: p.ink.c400, fontSize: 12)),
            ),
            Expanded(child: Divider(color: p.ink.c200)),
          ],
        ),
        const SizedBox(height: 20),
      ],
    );
  }
}

/// Outlined pill matching the web's social button (border-ink-300, surface bg,
/// semibold ink-800 label, centered icon + text).
class _SocialButton extends StatelessWidget {
  const _SocialButton({
    required this.onPressed,
    required this.icon,
    required this.label,
  });

  final VoidCallback onPressed;
  final Widget icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    return SizedBox(
      height: 50,
      child: OutlinedButton.icon(
        onPressed: onPressed,
        icon: icon,
        label: Text(label),
        style: OutlinedButton.styleFrom(
          foregroundColor: p.ink.c800,
          backgroundColor: p.surface,
          side: BorderSide(color: p.ink.c300),
          shape:
              RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        ),
      ),
    );
  }
}

/// The multicolour Google "G", drawn to match the web's inline SVG.
class _GoogleG extends StatelessWidget {
  const _GoogleG();

  @override
  Widget build(BuildContext context) =>
      const FaIcon(FontAwesomeIcons.google, size: 18, color: Color(0xFF4285F4));
}
