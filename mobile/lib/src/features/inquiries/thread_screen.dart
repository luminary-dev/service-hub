import 'package:flutter/material.dart';
import 'package:baas_mobile/l10n/gen/app_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../models/models.dart';
import '../../palette.dart';
import '../../state/providers.dart';
import '../../widgets/common.dart';

final threadProvider = FutureProvider.autoDispose
    .family<List<ThreadMessage>, String>(
        (ref, id) => ref.watch(marketplaceApiProvider).threadMessages(id));

class ThreadScreen extends ConsumerStatefulWidget {
  const ThreadScreen({
    super.key,
    required this.inquiryId,
    required this.providerName,
  });

  final String inquiryId;
  final String providerName;

  @override
  ConsumerState<ThreadScreen> createState() => _ThreadScreenState();
}

class _ThreadScreenState extends ConsumerState<ThreadScreen> {
  final _controller = TextEditingController();
  bool _sending = false;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final messages = ref.watch(threadProvider(widget.inquiryId));
    return Scaffold(
      appBar: AppBar(title: Text(widget.providerName)),
      body: Column(
        children: [
          Expanded(
            child: switch (messages) {
              AsyncData(:final value) => ListView.builder(
                  reverse: true,
                  padding: const EdgeInsets.all(16),
                  itemCount: value.length,
                  itemBuilder: (context, i) {
                    final m = value[value.length - 1 - i];
                    return Align(
                      alignment: m.fromProvider
                          ? Alignment.centerLeft
                          : Alignment.centerRight,
                      child: Container(
                        margin: const EdgeInsets.symmetric(vertical: 4),
                        padding: const EdgeInsets.symmetric(
                            horizontal: 14, vertical: 10),
                        constraints: BoxConstraints(
                          maxWidth: MediaQuery.of(context).size.width * 0.75,
                        ),
                        decoration: BoxDecoration(
                          color: m.fromProvider
                              ? context.palette.ink.c100
                              : context.palette.brand.c50,
                          borderRadius: BorderRadius.circular(14),
                        ),
                        child: Text(m.body),
                      ),
                    );
                  },
                ),
              AsyncError() => ErrorRetry(
                  onRetry: () =>
                      ref.invalidate(threadProvider(widget.inquiryId))),
              _ => const Center(child: CircularProgressIndicator()),
            },
          ),
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 4, 8, 8),
              child: Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _controller,
                      decoration: InputDecoration(hintText: l10n.reply),
                      textInputAction: TextInputAction.send,
                      onSubmitted: (_) => _send(),
                    ),
                  ),
                  IconButton(
                    icon: const Icon(Icons.send),
                    onPressed: _sending ? null : _send,
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _send() async {
    final body = _controller.text.trim();
    if (body.isEmpty) return;
    setState(() => _sending = true);
    final ok = await ref
        .read(marketplaceApiProvider)
        .sendThreadMessage(widget.inquiryId, body);
    if (!mounted) return;
    setState(() => _sending = false);
    if (ok) {
      _controller.clear();
      ref.invalidate(threadProvider(widget.inquiryId));
    } else {
      final l10n = AppLocalizations.of(context);
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(l10n.genericError)));
    }
  }
}
