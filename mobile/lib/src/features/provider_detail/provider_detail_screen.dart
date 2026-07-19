import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:baas_mobile/l10n/gen/app_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../models/models.dart';
import '../../palette.dart';
import '../../state/providers.dart';
import '../../theme.dart';
import '../../tv/glass.dart';
import '../../widgets/brand_loader.dart';
import '../../widgets/common.dart';
import '../../widgets/app_icon.dart';

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
    final favorited =
        (ref.watch(favoritesControllerProvider).value ?? {}).contains(providerId);
    return Scaffold(
      body: Stack(
        children: [
          switch (detail) {
            AsyncData(value: final d?) => _DetailBody(detail: d),
            AsyncData() => EmptyState(message: l10n.genericError),
            AsyncError() => ErrorRetry(
                onRetry: () =>
                    ref.invalidate(providerDetailProvider(providerId))),
            _ => const BrandLoaderCentered(),
          },
          // Floating glass back + heart chrome over the cover.
          Positioned(
            top: MediaQuery.of(context).padding.top + 8,
            left: 16,
            right: 16,
            child: Row(
              children: [
                GlassIconButton(
                  onTap: () => context.pop(),
                  child: const AppIcon(AppIcons.arrowLeft,
                      size: 15, color: Colors.white),
                ),
                const Spacer(),
                if (ref.watch(authControllerProvider).value != null)
                  GlassIconButton(
                    onTap: () => ref
                        .read(favoritesControllerProvider.notifier)
                        .toggle(providerId),
                    child: AppIcon(
                      favorited
                          ? AppIcons.heart
                          : AppIcons.regHeart,
                      size: 16,
                      color: context.palette.red,
                    ),
                  ),
              ],
            ),
          ),
        ],
      ),
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

    final cp = context.palette;
    return ListView(
      padding: EdgeInsets.zero,
      children: [
        // Full-bleed cover hero.
        SizedBox(
          height: 420,
          child: Stack(
            fit: StackFit.expand,
            children: [
              if (p.coverPhoto != null || p.avatarUrl != null)
                CachedNetworkImage(
                  imageUrl: resolveMediaUrl(p.coverPhoto ?? p.avatarUrl!),
                  fit: BoxFit.cover,
                  errorWidget: (_, _, _) => ColoredBox(color: cp.ink.c100),
                )
              else
                ColoredBox(color: cp.ink.c100),
              DecoratedBox(
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    stops: const [0, 0.32, 0.7, 1],
                    colors: [
                      Colors.black.withValues(alpha: 0.3),
                      Colors.transparent,
                      cp.ink.c50.withValues(alpha: 0.6),
                      cp.ink.c50,
                    ],
                  ),
                ),
              ),
              Positioned(
                left: 20,
                right: 20,
                bottom: 20,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Container(
                      padding:
                          const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                      decoration: BoxDecoration(
                          color: cp.brand.c700,
                          borderRadius: BorderRadius.circular(3)),
                      child: Text(p.category.toUpperCase(),
                          style: TextStyle(
                            fontFamily: kFontMono,
                            fontSize: 10,
                            fontWeight: FontWeight.w600,
                            letterSpacing: 1.4,
                            color: cp.onBrand,
                          )),
                    ),
                    const SizedBox(height: 10),
                    Row(
                      children: [
                        Flexible(
                          child: Text(p.name,
                              style: const TextStyle(
                                fontFamily: kFontSans,
                                fontSize: 30,
                                height: 1.08,
                                fontWeight: FontWeight.w700,
                                letterSpacing: -0.5,
                                color: Colors.white,
                                shadows: [
                                  Shadow(
                                      blurRadius: 16, color: Color(0x73000000))
                                ],
                              )),
                        ),
                        if (p.verificationStatus == 'APPROVED')
                          Padding(
                            padding: const EdgeInsets.only(left: 8),
                            child: AppIcon(AppIcons.circleCheck,
                                size: 18, color: cp.emerald),
                          ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    Row(
                      children: [
                        AppIcon(AppIcons.star,
                            size: 11, color: cp.amber),
                        const SizedBox(width: 6),
                        Flexible(
                          child: Text(
                            [
                              if (p.rating != null) p.rating!.toStringAsFixed(1),
                              '${p.reviewCount} REVIEWS',
                              p.district.toUpperCase(),
                              if (p.experience > 0) '${p.experience} YRS',
                            ].join('  ·  '),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              fontFamily: kFontMono,
                              fontSize: 11,
                              letterSpacing: 1.1,
                              color: Color(0xFFC2C6CB),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 4, 20, 0),
          child: Row(
            children: [
              Expanded(
                child: FilledButton.icon(
                  icon: const AppIcon(AppIcons.paperPlane, size: 13),
                  label: Text(l10n.sendInquiry),
                  onPressed: () => _openInquirySheet(context, ref),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: OutlinedButton.icon(
                  icon: const AppIcon(AppIcons.phone, size: 13),
                  label: Text(l10n.call),
                  onPressed: () => _revealContact(context, ref),
                ),
              ),
            ],
          ),
        ),
        if (bio.isNotEmpty) ...[
          _SectionHeader(l10n.aboutSection),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20),
            child: Text(bio,
                style: TextStyle(
                    height: 1.55, color: cp.ink.c600, fontSize: 14.5)),
          ),
        ],
        if (detail.services.isNotEmpty) ...[
          _SectionHeader(l10n.servicesSection),
          for (final s in detail.services)
            Container(
              margin: const EdgeInsets.fromLTRB(20, 0, 20, 10),
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: cp.surface,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: cp.ink.c200),
              ),
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          locale == 'si' && s.titleSi?.isNotEmpty == true
                              ? s.titleSi!
                              : s.title,
                          style: TextStyle(
                              fontSize: 15,
                              fontWeight: FontWeight.w600,
                              color: cp.ink.c900),
                        ),
                        if (s.description != null)
                          Padding(
                            padding: const EdgeInsets.only(top: 2),
                            child: Text(s.description!,
                                style: TextStyle(
                                    fontSize: 13, color: cp.ink.c500)),
                          ),
                      ],
                    ),
                  ),
                  if (s.price != null)
                    Text(
                      'RS. ${s.price}${s.priceType == 'HOURLY' ? '/HR' : ''}',
                      style: TextStyle(
                        fontFamily: kFontMono,
                        fontSize: 12.5,
                        fontWeight: FontWeight.w600,
                        color: cp.brand.c800,
                      ),
                    ),
                ],
              ),
            ),
        ],
        if (detail.photos.isNotEmpty) ...[
          _SectionHeader(l10n.photosSection),
          SizedBox(
            height: 120,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 20),
              itemCount: detail.photos.length,
              separatorBuilder: (_, _) => const SizedBox(width: 10),
              itemBuilder: (_, i) => ClipRRect(
                borderRadius: BorderRadius.circular(14),
                child: CachedNetworkImage(
                  imageUrl: resolveMediaUrl(detail.photos[i].url),
                  width: 170,
                  fit: BoxFit.cover,
                ),
              ),
            ),
          ),
        ],
        _SectionHeader(l10n.reviewsSection),
        if (ref.watch(authControllerProvider).value != null)
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12),
            child: Align(
              alignment: Alignment.centerLeft,
              child: TextButton.icon(
                icon: const AppIcon(AppIcons.squarePen, size: 13),
                label: Text(l10n.writeReview),
                onPressed: () => _openReviewSheet(context, ref),
              ),
            ),
          ),
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 0),
          child: detail.reviews.reviews.isEmpty
              ? Text(l10n.noNotifications,
                  style: TextStyle(color: cp.ink.c500))
              : Column(
                  children: [
                    for (final r in detail.reviews.reviews)
                      _ReviewTile(review: r),
                  ],
                ),
        ),
        const SizedBox(height: 48),
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
                leading: const AppIcon(AppIcons.phone),
                title: Text(contact.phone!),
              ),
            if (contact.phone2 != null)
              ListTile(
                leading: const AppIcon(AppIcons.phone),
                title: Text(contact.phone2!),
              ),
            if (contact.whatsapp != null)
              ListTile(
                leading: const AppIcon(AppIcons.commentDots),
                title: Text('${l10n.whatsapp}: ${contact.whatsapp!}'),
              ),
            if (contact.email != null)
              ListTile(
                leading: const AppIcon(AppIcons.envelope),
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
      padding: const EdgeInsets.fromLTRB(20, 26, 20, 12),
      child: Text(title,
          style: TextStyle(
            fontFamily: kFontSans,
            fontSize: 19,
            fontWeight: FontWeight.w700,
            letterSpacing: -0.3,
            color: context.palette.ink.c900,
          )),
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
                color: context.palette.ink.c100,
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
                    color: context.palette.amber,
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
