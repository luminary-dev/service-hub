import 'package:flutter/material.dart';
import 'package:baas_mobile/l10n/gen/app_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../models/models.dart';
import '../../state/providers.dart';

class AccountScreen extends ConsumerWidget {
  const AccountScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final auth = ref.watch(authControllerProvider);
    return Scaffold(
      appBar: AppBar(title: Text(l10n.tabAccount)),
      body: switch (auth) {
        AsyncData(value: final user?) => _SignedIn(user: user),
        AsyncLoading() => const Center(child: CircularProgressIndicator()),
        _ => _Guest(),
      },
    );
  }
}

class _Guest extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return ListView(
      padding: const EdgeInsets.all(24),
      children: [
        Text(l10n.guestBrowsePrompt),
        const SizedBox(height: 16),
        FilledButton(
          onPressed: () => context.push('/login'),
          child: Text(l10n.signIn),
        ),
        const SizedBox(height: 8),
        OutlinedButton(
          onPressed: () => context.push('/register'),
          child: Text(l10n.register),
        ),
        const Divider(height: 48),
        const _LanguageTile(),
      ],
    );
  }
}

class _SignedIn extends ConsumerWidget {
  const _SignedIn({required this.user});

  final UserAccount user;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    return ListView(
      children: [
        ListTile(
          leading: CircleAvatar(
              child: Text(user.name.isNotEmpty ? user.name[0] : '?')),
          title: Text(user.name),
          subtitle: Text(user.email ?? ''),
        ),
        if (!user.emailVerified)
          Container(
            margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: const Color(0xFFFEF3C7),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(l10n.verifyEmailBanner),
                TextButton(
                  onPressed: () async {
                    final ok = await ref
                        .read(authRepositoryProvider)
                        .resendVerification();
                    if (context.mounted && ok) {
                      ScaffoldMessenger.of(context).showSnackBar(
                          SnackBar(content: Text(l10n.verificationSent)));
                    }
                  },
                  child: Text(l10n.resendVerification),
                ),
              ],
            ),
          ),
        const Divider(),
        ListTile(
          leading: const Icon(Icons.forum_outlined),
          title: Text(l10n.myInquiries),
          onTap: () => context.push('/inquiries'),
        ),
        ListTile(
          leading: const Icon(Icons.favorite_border),
          title: Text(l10n.favorites),
          onTap: () => context.push('/favorites'),
        ),
        ListTile(
          leading: const Icon(Icons.person_outline),
          title: Text(l10n.profile),
          onTap: () => _openProfileSheet(context, ref),
        ),
        const _LanguageTile(),
        const Divider(),
        ListTile(
          leading: const Icon(Icons.logout),
          title: Text(l10n.signOut),
          onTap: () => ref.read(authControllerProvider.notifier).logout(),
        ),
      ],
    );
  }

  void _openProfileSheet(BuildContext context, WidgetRef ref) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (_) => _ProfileSheet(user: user),
    );
  }
}

class _LanguageTile extends ConsumerWidget {
  const _LanguageTile();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final locale = ref.watch(localeControllerProvider);
    return ListTile(
      leading: const Icon(Icons.language),
      title: Text(l10n.language),
      trailing: SegmentedButton<String>(
        segments: [
          ButtonSegment(value: 'en', label: Text(l10n.english)),
          ButtonSegment(value: 'si', label: Text(l10n.sinhala)),
        ],
        selected: {locale.languageCode},
        onSelectionChanged: (selection) => ref
            .read(localeControllerProvider.notifier)
            .set(Locale(selection.first)),
      ),
    );
  }
}

class _ProfileSheet extends ConsumerStatefulWidget {
  const _ProfileSheet({required this.user});

  final UserAccount user;

  @override
  ConsumerState<_ProfileSheet> createState() => _ProfileSheetState();
}

class _ProfileSheetState extends ConsumerState<_ProfileSheet> {
  late final _name = TextEditingController(text: widget.user.name);
  late final _phone = TextEditingController(text: widget.user.phone ?? '');
  bool _busy = false;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Padding(
      padding: EdgeInsets.only(
        left: 16,
        right: 16,
        top: 16,
        bottom: MediaQuery.of(context).viewInsets.bottom + 16,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(l10n.profile, style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: 12),
          TextField(
            controller: _name,
            decoration: InputDecoration(labelText: l10n.name),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _phone,
            keyboardType: TextInputType.phone,
            decoration: InputDecoration(labelText: l10n.phone),
          ),
          const SizedBox(height: 16),
          FilledButton(
            onPressed: _busy ? null : _save,
            child: Text(l10n.save),
          ),
        ],
      ),
    );
  }

  Future<void> _save() async {
    final l10n = AppLocalizations.of(context);
    setState(() => _busy = true);
    final ok = await ref.read(authRepositoryProvider).updateProfile(
        name: _name.text.trim(), phone: _phone.text.trim());
    if (!mounted) return;
    if (ok) {
      await ref.read(authControllerProvider.notifier).reload();
    }
    if (!mounted) return;
    Navigator.of(context).pop();
    ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(ok ? l10n.saved : l10n.genericError)));
  }
}
