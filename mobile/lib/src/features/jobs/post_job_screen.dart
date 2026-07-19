import 'package:flutter/material.dart';
import 'package:baas_mobile/l10n/gen/app_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../palette.dart';
import '../../state/providers.dart';
import '../browse/results_screen.dart' show kDistricts;
import 'jobs_screen.dart' show myJobsProvider;

class PostJobScreen extends ConsumerStatefulWidget {
  const PostJobScreen({super.key});

  @override
  ConsumerState<PostJobScreen> createState() => _PostJobScreenState();
}

class _PostJobScreenState extends ConsumerState<PostJobScreen> {
  final _formKey = GlobalKey<FormState>();
  final _title = TextEditingController();
  final _description = TextEditingController();
  final _budget = TextEditingController();
  String? _category;
  String? _district;
  bool _sending = false;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final locale = Localizations.localeOf(context).languageCode;
    final categories = ref.watch(categoriesProvider).value ?? const [];
    final verified =
        ref.watch(authControllerProvider).value?.emailVerified ?? false;

    return Scaffold(
      appBar: AppBar(title: Text(l10n.postJob)),
      body: Form(
        key: _formKey,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            if (!verified)
              Container(
                margin: const EdgeInsets.only(bottom: 16),
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: context.palette.brand.c50,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: context.palette.brand.c100),
                ),
                child: Text(l10n.jobNeedsVerifiedEmail,
                    style: TextStyle(color: context.palette.brand.c800)),
              ),
            DropdownButtonFormField<String>(
              initialValue: _category,
              decoration: InputDecoration(labelText: l10n.allCategories),
              items: [
                for (final c in categories)
                  DropdownMenuItem(value: c.slug, child: Text(c.label(locale))),
              ],
              onChanged: (v) => setState(() => _category = v),
              validator: (v) => v == null ? l10n.fieldRequired : null,
            ),
            const SizedBox(height: 12),
            DropdownButtonFormField<String>(
              initialValue: _district,
              decoration: InputDecoration(labelText: l10n.allDistricts),
              items: [
                for (final d in kDistricts)
                  DropdownMenuItem(value: d, child: Text(d)),
              ],
              onChanged: (v) => setState(() => _district = v),
              validator: (v) => v == null ? l10n.fieldRequired : null,
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _title,
              decoration: InputDecoration(labelText: l10n.jobTitle),
              validator: (v) =>
                  (v == null || v.trim().isEmpty) ? l10n.fieldRequired : null,
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _description,
              maxLines: 5,
              decoration: InputDecoration(labelText: l10n.jobDescription),
              validator: (v) =>
                  (v == null || v.trim().isEmpty) ? l10n.fieldRequired : null,
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _budget,
              keyboardType: TextInputType.number,
              decoration: InputDecoration(labelText: l10n.budgetOptional),
            ),
            const SizedBox(height: 24),
            FilledButton(
              onPressed: _sending ? null : _submit,
              child: Text(l10n.postJob),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _submit() async {
    final l10n = AppLocalizations.of(context);
    if (!_formKey.currentState!.validate()) return;
    setState(() => _sending = true);
    final code = await ref.read(marketplaceApiProvider).postJob(
          category: _category!,
          district: _district!,
          title: _title.text.trim(),
          description: _description.text.trim(),
          budget: int.tryParse(_budget.text.trim()),
        );
    if (!mounted) return;
    setState(() => _sending = false);
    if (code == null) {
      ref.invalidate(myJobsProvider);
      context.pop();
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(l10n.jobPosted)));
    } else {
      final message = code == 'EMAIL_NOT_VERIFIED'
          ? l10n.jobNeedsVerifiedEmail
          : l10n.genericError;
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(message)));
    }
  }
}
