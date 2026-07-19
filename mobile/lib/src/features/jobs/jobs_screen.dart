import 'package:flutter/material.dart';
import 'package:baas_mobile/l10n/gen/app_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../models/models.dart';
import '../../palette.dart';
import '../../state/providers.dart';
import '../../widgets/common.dart';

final myJobsProvider = FutureProvider.autoDispose<List<Job>>(
    (ref) => ref.watch(marketplaceApiProvider).myJobs());

class JobsScreen extends ConsumerWidget {
  const JobsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final signedIn = ref.watch(authControllerProvider).value != null;
    if (!signedIn) {
      return Scaffold(
        body: Column(
          children: [
            PageHeading(title: l10n.myJobs),
            Expanded(child: _SignInPrompt(message: l10n.guestBrowsePrompt)),
          ],
        ),
      );
    }
    final jobs = ref.watch(myJobsProvider);
    return Scaffold(
      body: Column(
        children: [
          PageHeading(
            title: l10n.myJobs,
            trailing: FilledButton.icon(
              style: FilledButton.styleFrom(
                minimumSize: const Size(0, 40),
                padding: const EdgeInsets.symmetric(horizontal: 16),
              ),
              icon: const Icon(Icons.add, size: 18),
              label: Text(l10n.postJob),
              onPressed: () => context.push('/jobs/new'),
            ),
          ),
          Expanded(
            child: switch (jobs) {
              AsyncData(:final value) when value.isEmpty =>
                EmptyState(message: l10n.noJobs, icon: Icons.work_outline),
              AsyncData(:final value) => RefreshIndicator(
                  onRefresh: () async => ref.refresh(myJobsProvider.future),
                  child: ListView.separated(
                    padding: const EdgeInsets.all(16),
                    itemCount: value.length,
                    separatorBuilder: (_, _) => const SizedBox(height: 12),
                    itemBuilder: (context, i) => _JobCard(job: value[i]),
                  ),
                ),
              AsyncError() =>
                ErrorRetry(onRetry: () => ref.invalidate(myJobsProvider)),
              _ => const Center(child: CircularProgressIndicator()),
            },
          ),
        ],
      ),
    );
  }
}

class _JobCard extends ConsumerWidget {
  const _JobCard({required this.job});

  final Job job;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final open = job.status == 'OPEN';
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(job.title,
                      style: Theme.of(context).textTheme.titleMedium),
                ),
                Chip(
                  visualDensity: VisualDensity.compact,
                  side: BorderSide.none,
                  label:
                      Text(open ? l10n.jobStatusOpen : l10n.jobStatusClosed),
                  labelStyle: TextStyle(
                    color: open
                        ? context.palette.emerald
                        : context.palette.ink.c600,
                    fontWeight: FontWeight.w600,
                    fontSize: 12,
                  ),
                  backgroundColor: open
                      ? context.palette.emerald.withValues(alpha: 0.14)
                      : context.palette.ink.c100,
                ),
              ],
            ),
            Text('${job.category} · ${job.district}'),
            if (job.budget != null)
              Padding(
                padding: const EdgeInsets.only(top: 4),
                child: Text('Rs. ${job.budget}',
                    style: Theme.of(context)
                        .textTheme
                        .bodyMedium
                        ?.copyWith(fontWeight: FontWeight.w600)),
              ),
            if (job.description.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Text(job.description,
                    maxLines: 3, overflow: TextOverflow.ellipsis),
              ),
            const SizedBox(height: 8),
            Row(
              children: [
                Text(l10n.jobResponses(job.responses.length),
                    style: Theme.of(context).textTheme.bodySmall),
                const Spacer(),
                TextButton(
                  onPressed: () async {
                    final ok = await ref
                        .read(marketplaceApiProvider)
                        .setJobStatus(job.id, open ? 'CLOSED' : 'OPEN');
                    if (ok) ref.invalidate(myJobsProvider);
                  },
                  child: Text(open ? l10n.closeJob : l10n.reopenJob),
                ),
              ],
            ),
            for (final r in job.responses.take(3))
              Container(
                margin: const EdgeInsets.only(top: 8),
                padding: const EdgeInsets.all(10),
                width: double.infinity,
                decoration: BoxDecoration(
                  color: context.palette.ink.c100,
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (r.providerName.isNotEmpty)
                      Text(r.providerName,
                          style: Theme.of(context)
                              .textTheme
                              .bodySmall
                              ?.copyWith(fontWeight: FontWeight.w600)),
                    Text(r.message),
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _SignInPrompt extends StatelessWidget {
  const _SignInPrompt({required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(message, textAlign: TextAlign.center),
            const SizedBox(height: 16),
            FilledButton(
              onPressed: () => context.push('/login'),
              child: Text(l10n.signIn),
            ),
          ],
        ),
      ),
    );
  }
}
