import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:baas_mobile/l10n/gen/app_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../models/models.dart';
import '../../state/providers.dart';
import '../../widgets/common.dart';

final providerDetailProvider = FutureProvider.autoDispose
    .family<ProviderDetail?, String>(
        (ref, id) => ref.watch(marketplaceApiProvider).providerDetail(id));

class ProviderDetailScreen extends ConsumerWidget {
  const ProviderDetailScreen({super.key, required this.providerId});

  final String providerId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final detail = ref.watch(providerDetailProvider(providerId));
    return Scaffold(
      appBar: AppBar(
        title: Text(detail.value?.summary.name ?? ''),
        actions: [
          if (ref.watch(authControllerProvider).value != null)
            IconButton(
              icon: Icon(
                (ref.watch(favoritesControllerProvider).value ?? {})
                        .contains(providerId)
                    ? Icons.favorite
                    : Icons.favorite_border,
                color: const Color(0xFFDC2626),
              ),
              onPressed: () => ref
                  .read(favoritesControllerProvider.notifier)
                  .toggle(providerId),
            ),
        ],
      ),
      body: switch (detail) {
        AsyncData(value: final d?) => _DetailBody(detail: d),
        AsyncData() => EmptyState(message: l10n.genericError),
        AsyncError() => ErrorRetry(
            onRetry: () => ref.invalidate(providerDetailProvider(providerId))),
        _ => const Center(child: CircularProgressIndicator()),
      },
    );
  }
}

class _DetailBody extends ConsumerWidget {
  const _DetailBody({required this.detail});

  final ProviderDetail detail;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final locale = Localizations.localeOf(context).languageCode;
    final p = detail.summary;
    final bio = locale == 'si' && detail.bioSi?.isNotEmpty == true
        ? detail.bioSi!
        : detail.bio;

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Row(
          children: [
            CircleAvatar(
              radius: 32,
              backgroundImage: p.avatarUrl != null
                  ? CachedNetworkImageProvider(resolveMediaUrl(p.avatarUrl!))
                  : null,
              child: p.avatarUrl == null
                  ? Text(p.name.isNotEmpty ? p.name[0] : '?')
                  : null,
            ),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(children: [
                    Flexible(
                      child: Text(p.name,
                          style: Theme.of(context).textTheme.titleLarge),
                    ),
                    if (p.verificationStatus == 'APPROVED')
                      const Padding(
                        padding: EdgeInsets.only(left: 6),
                        child: Icon(Icons.verified,
                            size: 20, color: Color(0xFF0284C7)),
                      ),
                  ]),
                  Text('${p.category} · ${p.district}'),
                  if (p.rating != null)
                    Row(children: [
                      RatingStars(rating: p.rating!),
                      const SizedBox(width: 6),
                      Text(l10n.reviewsCount(p.reviewCount)),
                    ]),
                ],
              ),
            ),
          ],
        ),
        const SizedBox(height: 16),
        Row(
          children: [
            Expanded(
              child: FilledButton.icon(
                icon: const Icon(Icons.send),
                label: Text(l10n.sendInquiry),
                onPressed: () => _openInquirySheet(context, ref),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: OutlinedButton.icon(
                icon: const Icon(Icons.call),
                label: Text(l10n.showContact),
                onPressed: () => _revealContact(context, ref),
              ),
            ),
          ],
        ),
        if (bio.isNotEmpty) ...[
          _SectionHeader(l10n.aboutSection),
          Text(bio),
        ],
        if (detail.services.isNotEmpty) ...[
          _SectionHeader(l10n.servicesSection),
          for (final s in detail.services)
            ListTile(
              contentPadding: EdgeInsets.zero,
              title: Text(
                locale == 'si' && s.titleSi?.isNotEmpty == true
                    ? s.titleSi!
                    : s.title,
              ),
              subtitle: s.description != null ? Text(s.description!) : null,
              trailing: s.price != null
                  ? Text(
                      'Rs. ${s.price}${s.priceType == 'HOURLY' ? '/hr' : ''}',
                      style: Theme.of(context)
                          .textTheme
                          .titleSmall
                          ?.copyWith(fontWeight: FontWeight.w600),
                    )
                  : null,
            ),
        ],
        if (detail.photos.isNotEmpty) ...[
          _SectionHeader(l10n.photosSection),
          SizedBox(
            height: 120,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              itemCount: detail.photos.length,
              separatorBuilder: (_, _) => const SizedBox(width: 8),
              itemBuilder: (_, i) => ClipRRect(
                borderRadius: BorderRadius.circular(12),
                child: CachedNetworkImage(
                  imageUrl: resolveMediaUrl(detail.photos[i].url),
                  width: 160,
                  fit: BoxFit.cover,
                ),
              ),
            ),
          ),
        ],
        _SectionHeader(l10n.reviewsSection),
        if (ref.watch(authControllerProvider).value != null)
          Align(
            alignment: Alignment.centerLeft,
            child: TextButton.icon(
              icon: const Icon(Icons.rate_review_outlined),
              label: Text(l10n.writeReview),
              onPressed: () => _openReviewSheet(context, ref),
            ),
          ),
        if (detail.reviews.reviews.isEmpty)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 8),
            child: Text(l10n.noNotifications),
          )
        else
          for (final r in detail.reviews.reviews) _ReviewTile(review: r),
      ],
    );
  }

  Future<void> _revealContact(BuildContext context, WidgetRef ref) async {
    final l10n = AppLocalizations.of(context);
    final contact =
        await ref.read(marketplaceApiProvider).revealContact(detail.summary.id);
    if (!context.mounted) return;
    if (contact == null) {
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(l10n.genericError)));
      return;
    }
    showModalBottomSheet<void>(
      context: context,
      builder: (_) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (contact.phone != null)
              ListTile(
                leading: const Icon(Icons.call),
                title: Text(contact.phone!),
              ),
            if (contact.phone2 != null)
              ListTile(
                leading: const Icon(Icons.call),
                title: Text(contact.phone2!),
              ),
            if (contact.whatsapp != null)
              ListTile(
                leading: const Icon(Icons.chat),
                title: Text('${l10n.whatsapp}: ${contact.whatsapp!}'),
              ),
            if (contact.email != null)
              ListTile(
                leading: const Icon(Icons.email_outlined),
                title: Text(contact.email!),
              ),
          ],
        ),
      ),
    );
  }

  void _openInquirySheet(BuildContext context, WidgetRef ref) {
    final user = ref.read(authControllerProvider).value;
    if (user == null) {
      context.push('/login');
      return;
    }
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (_) => _InquirySheet(providerId: detail.summary.id, user: user),
    );
  }

  void _openReviewSheet(BuildContext context, WidgetRef ref) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (_) => _ReviewSheet(providerId: detail.summary.id),
    );
  }
}

class _SectionHeader extends StatelessWidget {
  const _SectionHeader(this.title);

  final String title;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 24, bottom: 8),
      child: Text(title, style: Theme.of(context).textTheme.titleMedium),
    );
  }
}

class _ReviewTile extends StatelessWidget {
  const _ReviewTile({required this.review});

  final Review review;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              RatingStars(rating: review.rating.toDouble()),
              const SizedBox(width: 8),
              Text(review.authorName,
                  style: Theme.of(context).textTheme.bodySmall),
            ],
          ),
          if (review.comment.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Text(review.comment),
            ),
          if (review.responseText != null)
            Container(
              margin: const EdgeInsets.only(top: 8, left: 16),
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: const Color(0xFFF8FAFC),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Text(review.responseText!),
            ),
        ],
      ),
    );
  }
}

class _InquirySheet extends ConsumerStatefulWidget {
  const _InquirySheet({required this.providerId, required this.user});

  final String providerId;
  final dynamic user;

  @override
  ConsumerState<_InquirySheet> createState() => _InquirySheetState();
}

class _InquirySheetState extends ConsumerState<_InquirySheet> {
  final _formKey = GlobalKey<FormState>();
  late final _name = TextEditingController(text: widget.user.name as String);
  late final _phone =
      TextEditingController(text: (widget.user.phone as String?) ?? '');
  final _message = TextEditingController();
  bool _sending = false;

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
      child: Form(
        key: _formKey,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(l10n.sendInquiry,
                style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 12),
            TextFormField(
              controller: _name,
              decoration: InputDecoration(labelText: l10n.yourName),
              validator: (v) =>
                  (v == null || v.trim().isEmpty) ? l10n.fieldRequired : null,
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _phone,
              keyboardType: TextInputType.phone,
              decoration: InputDecoration(labelText: l10n.yourPhone),
              validator: (v) =>
                  (v == null || v.trim().isEmpty) ? l10n.fieldRequired : null,
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _message,
              maxLines: 4,
              decoration: InputDecoration(labelText: l10n.yourMessage),
              validator: (v) =>
                  (v == null || v.trim().isEmpty) ? l10n.fieldRequired : null,
            ),
            const SizedBox(height: 16),
            FilledButton(
              onPressed: _sending ? null : _send,
              child: Text(l10n.send),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _send() async {
    final l10n = AppLocalizations.of(context);
    if (!_formKey.currentState!.validate()) return;
    setState(() => _sending = true);
    final ok = await ref.read(marketplaceApiProvider).sendInquiry(
          widget.providerId,
          name: _name.text.trim(),
          phone: _phone.text.trim(),
          message: _message.text.trim(),
        );
    if (!mounted) return;
    Navigator.of(context).pop();
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(ok ? l10n.inquirySent : l10n.inquiryFailed)),
    );
  }
}

class _ReviewSheet extends ConsumerStatefulWidget {
  const _ReviewSheet({required this.providerId});

  final String providerId;

  @override
  ConsumerState<_ReviewSheet> createState() => _ReviewSheetState();
}

class _ReviewSheetState extends ConsumerState<_ReviewSheet> {
  int _rating = 5;
  final _comment = TextEditingController();
  bool _sending = false;

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
          Text(l10n.writeReview, style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: 12),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              for (var i = 1; i <= 5; i++)
                IconButton(
                  icon: Icon(
                    i <= _rating ? Icons.star : Icons.star_border,
                    color: const Color(0xFFF59E0B),
                    size: 32,
                  ),
                  onPressed: () => setState(() => _rating = i),
                ),
            ],
          ),
          TextField(
            controller: _comment,
            maxLines: 4,
            decoration: InputDecoration(labelText: l10n.comment),
          ),
          const SizedBox(height: 16),
          FilledButton(
            onPressed: _sending ? null : _submit,
            child: Text(l10n.submitReview),
          ),
        ],
      ),
    );
  }

  Future<void> _submit() async {
    final l10n = AppLocalizations.of(context);
    setState(() => _sending = true);
    final code = await ref.read(marketplaceApiProvider).submitReview(
          widget.providerId,
          rating: _rating,
          comment: _comment.text.trim(),
        );
    if (!mounted) return;
    Navigator.of(context).pop();
    final message = switch (code) {
      null => l10n.reviewSubmitted,
      'INTERACTION_REQUIRED' => l10n.reviewNeedsInteraction,
      'EMAIL_NOT_VERIFIED' => l10n.reviewNeedsVerifiedEmail,
      _ => l10n.genericError,
    };
    ScaffoldMessenger.of(context)
        .showSnackBar(SnackBar(content: Text(message)));
  }
}
