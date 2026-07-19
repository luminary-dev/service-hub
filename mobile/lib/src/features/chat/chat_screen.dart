import 'package:flutter/material.dart';
import 'package:baas_mobile/l10n/gen/app_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../api/chat_repository.dart';
import '../../palette.dart';
import '../../state/providers.dart';
import '../../widgets/common.dart';

class _Bubble {
  _Bubble(this.role, this.text);

  final String role; // user | assistant
  String text;
}

class ChatScreen extends ConsumerStatefulWidget {
  const ChatScreen({super.key});

  @override
  ConsumerState<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends ConsumerState<ChatScreen> {
  final _controller = TextEditingController();
  final _bubbles = <_Bubble>[];
  ChatProposal? _proposal;
  bool _streaming = false;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final signedIn = ref.watch(authControllerProvider).value != null;

    return Scaffold(
      body: !signedIn
          ? Column(
              children: [
                PageHeading(title: l10n.tabChat),
                Expanded(
                  child: Center(
                    child: Padding(
                      padding: const EdgeInsets.all(32),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(l10n.assistantSignInFirst,
                              textAlign: TextAlign.center),
                          const SizedBox(height: 16),
                          FilledButton(
                            onPressed: () => context.push('/login'),
                            child: Text(l10n.signIn),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ],
            )
          : Column(
              children: [
                PageHeading(title: l10n.tabChat),
                Expanded(
                  child: _bubbles.isEmpty
                      ? Center(
                          child: Padding(
                            padding: const EdgeInsets.all(32),
                            child: Text(l10n.assistantIntro,
                                textAlign: TextAlign.center),
                          ),
                        )
                      : ListView.builder(
                          reverse: true,
                          padding: const EdgeInsets.all(16),
                          itemCount: _bubbles.length,
                          itemBuilder: (context, i) {
                            final b = _bubbles[_bubbles.length - 1 - i];
                            final isUser = b.role == 'user';
                            return Align(
                              alignment: isUser
                                  ? Alignment.centerRight
                                  : Alignment.centerLeft,
                              child: Container(
                                margin:
                                    const EdgeInsets.symmetric(vertical: 4),
                                padding: const EdgeInsets.symmetric(
                                    horizontal: 14, vertical: 10),
                                constraints: BoxConstraints(
                                  maxWidth:
                                      MediaQuery.of(context).size.width * 0.8,
                                ),
                                decoration: BoxDecoration(
                                  color: isUser
                                      ? context.palette.brand.c50
                                      : context.palette.ink.c100,
                                  borderRadius: BorderRadius.circular(14),
                                ),
                                child: Text(
                                  b.text.isEmpty && !isUser ? '…' : b.text,
                                ),
                              ),
                            );
                          },
                        ),
                ),
                if (_proposal != null) _ProposalCard(
                  proposal: _proposal!,
                  onDismiss: () => setState(() => _proposal = null),
                  onConfirmed: () {
                    setState(() => _proposal = null);
                    ScaffoldMessenger.of(context).showSnackBar(
                        SnackBar(content: Text(l10n.inquirySent)));
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
                            decoration: InputDecoration(
                                hintText: l10n.assistantPlaceholder),
                            textInputAction: TextInputAction.send,
                            onSubmitted: (_) => _send(),
                          ),
                        ),
                        IconButton(
                          icon: const Icon(Icons.send),
                          onPressed: _streaming ? null : _send,
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
    final l10n = AppLocalizations.of(context);
    final text = _controller.text.trim();
    if (text.isEmpty || _streaming) return;
    _controller.clear();
    setState(() {
      _bubbles.add(_Bubble('user', text));
      _bubbles.add(_Bubble('assistant', ''));
      _streaming = true;
    });
    try {
      final history = [
        for (final b in _bubbles)
          if (b.text.isNotEmpty) (role: b.role, content: b.text),
      ];
      final stream = await ref.read(chatRepositoryProvider).send(history);
      await for (final event in stream) {
        if (!mounted) return;
        switch (event) {
          case ChatText(:final text):
            setState(() => _bubbles.last.text += text);
          case ChatProposal():
            setState(() => _proposal = event);
          case ChatError():
            setState(() => _bubbles.last.text = l10n.assistantUnavailable);
          case ChatToolUse() || ChatDone():
            break;
        }
      }
    } catch (_) {
      if (mounted) {
        setState(() => _bubbles.last.text = l10n.assistantUnavailable);
      }
    } finally {
      if (mounted) setState(() => _streaming = false);
    }
  }
}

/// The assistant only drafts — sending is an explicit user action, fired as a
/// normal authenticated inquiry (mirrors the web's ChatAssistant).
class _ProposalCard extends ConsumerWidget {
  const _ProposalCard({
    required this.proposal,
    required this.onDismiss,
    required this.onConfirmed,
  });

  final ChatProposal proposal;
  final VoidCallback onDismiss;
  final VoidCallback onConfirmed;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    return Card(
      margin: const EdgeInsets.fromLTRB(16, 0, 16, 8),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(l10n.assistantProposalTitle,
                style: Theme.of(context).textTheme.titleSmall),
            const SizedBox(height: 4),
            Text(proposal.providerName,
                style: const TextStyle(fontWeight: FontWeight.w600)),
            Text(proposal.message,
                maxLines: 3, overflow: TextOverflow.ellipsis),
            const SizedBox(height: 8),
            Row(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                TextButton(onPressed: onDismiss, child: Text(l10n.cancel)),
                FilledButton(
                  onPressed: () async {
                    final ok =
                        await ref.read(marketplaceApiProvider).sendInquiry(
                              proposal.providerId,
                              name: proposal.name,
                              phone: proposal.phone,
                              message: proposal.message,
                            );
                    if (ok) {
                      onConfirmed();
                    } else if (context.mounted) {
                      ScaffoldMessenger.of(context).showSnackBar(
                          SnackBar(content: Text(l10n.inquiryFailed)));
                    }
                  },
                  child: Text(l10n.confirmSend),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
