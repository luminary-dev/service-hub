import 'package:baas_mobile/l10n/gen/app_localizations.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:go_router/go_router.dart';

import '../palette.dart';
import '../state/providers.dart';

// Brand marks as inline SVG — the same multicolour Google "G" the web uses
// (GoogleSignInButton.tsx), plus Facebook. Rendered with flutter_svg so they
// always show (font-icon brand glyphs can be stripped by icon tree-shaking).
const _googleSvg = '''
<svg viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
<path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"/>
<path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z"/>
<path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z"/>
<path fill="#EA4335" d="M9 3.58c1.32 0 2.5.46 3.44 1.35l2.58-2.58A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z"/>
</svg>''';

const _facebookSvg = '''
<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
<path fill="#1877F2" d="M24 12c0-6.627-5.373-12-12-12S0 5.373 0 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078V12h3.047V9.356c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874V12h3.328l-.532 3.469h-2.796v8.385C19.612 22.954 24 17.99 24 12Z"/>
</svg>''';

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
      if (!context.mounted) return;
      // Success: leave the login screen just like password sign-in does
      // (login_screen.dart) — otherwise the web-auth sheet closes, the app is
      // signed in, but the login form stays up and it looks like nothing
      // happened.
      if (error == null) {
        if (context.canPop()) context.pop();
        return;
      }
      if (error != 'cancelled') {
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
          icon: SvgPicture.string(_googleSvg, width: 18, height: 18),
          label: l10n.continueWithGoogle,
        ),
        const SizedBox(height: 12),
        _SocialButton(
          onPressed: () => run('facebook'),
          icon: SvgPicture.string(_facebookSvg, width: 20, height: 20),
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

