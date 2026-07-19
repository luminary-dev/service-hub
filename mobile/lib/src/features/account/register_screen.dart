import 'package:flutter/material.dart';
import 'package:baas_mobile/l10n/gen/app_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../state/providers.dart';
import '../../widgets/social_login.dart';

/// Customer registration. Provider onboarding stays on the web for v1 — the
/// multi-step verification/photo flow isn't worth duplicating yet.
class RegisterScreen extends ConsumerStatefulWidget {
  const RegisterScreen({super.key});

  @override
  ConsumerState<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends ConsumerState<RegisterScreen> {
  final _formKey = GlobalKey<FormState>();
  final _name = TextEditingController();
  final _email = TextEditingController();
  final _phone = TextEditingController();
  final _password = TextEditingController();
  bool _busy = false;
  String? _error;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Scaffold(
      appBar: AppBar(title: Text(l10n.register)),
      body: Form(
        key: _formKey,
        child: ListView(
          padding: const EdgeInsets.all(24),
          children: [
            Text(l10n.createAccountSubtitle,
                style: Theme.of(context).textTheme.bodyLarge),
            const SizedBox(height: 24),
            const SocialLogin(),
            TextFormField(
              controller: _name,
              autofillHints: const [AutofillHints.name],
              decoration: InputDecoration(labelText: l10n.name),
              validator: (v) =>
                  (v == null || v.trim().isEmpty) ? l10n.fieldRequired : null,
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _email,
              keyboardType: TextInputType.emailAddress,
              autofillHints: const [AutofillHints.email],
              decoration: InputDecoration(labelText: l10n.email),
              validator: (v) =>
                  (v == null || !v.contains('@')) ? l10n.fieldRequired : null,
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _phone,
              keyboardType: TextInputType.phone,
              autofillHints: const [AutofillHints.telephoneNumber],
              decoration: InputDecoration(labelText: l10n.phone),
              validator: (v) =>
                  (v == null || v.trim().length < 9) ? l10n.fieldRequired : null,
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _password,
              obscureText: true,
              autofillHints: const [AutofillHints.newPassword],
              decoration: InputDecoration(labelText: l10n.password),
              validator: (v) =>
                  (v == null || v.length < 8) ? l10n.passwordTooShort : null,
            ),
            if (_error != null)
              Padding(
                padding: const EdgeInsets.only(top: 12),
                child: Text(
                  _error!,
                  style:
                      TextStyle(color: Theme.of(context).colorScheme.error),
                ),
              ),
            const SizedBox(height: 24),
            FilledButton(
              onPressed: _busy ? null : _submit,
              child: _busy
                  ? const SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : Text(l10n.register),
            ),
            const SizedBox(height: 12),
            TextButton(
              onPressed: () => context.replace('/login'),
              child: Text(l10n.signIn),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    final error =
        await ref.read(authControllerProvider.notifier).registerCustomer(
              name: _name.text.trim(),
              email: _email.text.trim(),
              phone: _phone.text.trim(),
              password: _password.text,
            );
    if (!mounted) return;
    if (error == null) {
      context.pop();
    } else {
      setState(() {
        _busy = false;
        _error = error;
      });
    }
  }
}
