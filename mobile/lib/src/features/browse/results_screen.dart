import 'dart:async';

import 'package:flutter/material.dart';
import 'package:baas_mobile/l10n/gen/app_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';

import '../../models/models.dart';
import '../../state/providers.dart';
import '../../widgets/brand_loader.dart';
import '../../widgets/common.dart';

/// Mirrors the web directory: districts from src/lib/constants.ts, sort keys
/// from src/lib/sort-keys.ts.
const kDistricts = [
  'Ampara', 'Anuradhapura', 'Badulla', 'Batticaloa', 'Colombo', 'Galle',
  'Gampaha', 'Hambantota', 'Jaffna', 'Kalutara', 'Kandy', 'Kegalle',
  'Kilinochchi', 'Kurunegala', 'Mannar', 'Matale', 'Matara', 'Monaragala',
  'Mullaitivu', 'Nuwara Eliya', 'Polonnaruwa', 'Puttalam', 'Ratnapura',
  'Trincomalee', 'Vavuniya',
];

class ResultsScreen extends ConsumerStatefulWidget {
  const ResultsScreen({super.key, this.initialCategory});

  /// Preselected trade slug when opened from a Home shelf tile.
  final String? initialCategory;

  @override
  ConsumerState<ResultsScreen> createState() => _ResultsScreenState();
}

class _ResultsScreenState extends ConsumerState<ResultsScreen> {
  final _searchController = TextEditingController();
  Timer? _debounce;

  String? _category;
  String? _district;
  String _sort = 'recommended';
  bool _availableOnly = false;
  ({double lat, double lng})? _position;

  final _providers = <ProviderSummary>[];
  int _page = 1;
  bool _hasMore = false;
  bool _loading = true;
  bool _error = false;

  @override
  void initState() {
    super.initState();
    _category = widget.initialCategory;
    _load(reset: true);
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _load({required bool reset}) async {
    if (reset) {
      setState(() {
        _loading = true;
        _error = false;
        _page = 1;
      });
    }
    try {
      final page = await ref.read(marketplaceApiProvider).browse(
            q: _searchController.text.trim(),
            category: _category,
            district: _district,
            sort: _sort,
            page: _page,
            availableOnly: _availableOnly,
            lat: _position?.lat,
            lng: _position?.lng,
          );
      if (!mounted) return;
      setState(() {
        if (reset) _providers.clear();
        _providers.addAll(page.providers);
        _hasMore = page.hasMore;
        _loading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = true;
      });
    }
  }

  void _onSearchChanged(String _) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 400), () {
      _load(reset: true);
    });
  }

  Future<void> _toggleNearMe() async {
    final l10n = AppLocalizations.of(context);
    if (_position != null) {
      setState(() => _position = null);
      _load(reset: true);
      return;
    }
    try {
      var permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
      }
      if (permission == LocationPermission.denied ||
          permission == LocationPermission.deniedForever) {
        throw Exception('denied');
      }
      final pos = await Geolocator.getCurrentPosition();
      setState(() => _position = (lat: pos.latitude, lng: pos.longitude));
      _load(reset: true);
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(l10n.locationDenied)));
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final locale = Localizations.localeOf(context).languageCode;
    final categories = ref.watch(categoriesProvider).value ?? const [];

    return Scaffold(
      appBar: AppBar(title: Text(l10n.navFind)),
      body: RefreshIndicator(
        onRefresh: () => _load(reset: true),
        child: CustomScrollView(
          slivers: [
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
                child: TextField(
                  controller: _searchController,
                  onChanged: _onSearchChanged,
                  textInputAction: TextInputAction.search,
                  decoration: InputDecoration(
                    hintText: l10n.searchHint,
                    prefixIcon: const Icon(Icons.search),
                  ),
                ),
              ),
            ),
            SliverToBoxAdapter(
              child: SizedBox(
                height: 56,
                child: ListView(
                  scrollDirection: Axis.horizontal,
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                  children: [
                    FilterChip(
                      avatar: const Icon(Icons.my_location, size: 16),
                      label: Text(l10n.nearMe),
                      selected: _position != null,
                      onSelected: (_) => _toggleNearMe(),
                    ),
                    const SizedBox(width: 8),
                    _dropdownChip<String?>(
                      value: _category,
                      hint: l10n.allCategories,
                      items: {
                        for (final c in categories) c.slug: c.label(locale),
                      },
                      onChanged: (v) {
                        setState(() => _category = v);
                        _load(reset: true);
                      },
                    ),
                    const SizedBox(width: 8),
                    _dropdownChip<String?>(
                      value: _district,
                      hint: l10n.allDistricts,
                      items: {for (final d in kDistricts) d: d},
                      onChanged: (v) {
                        setState(() => _district = v);
                        _load(reset: true);
                      },
                    ),
                    const SizedBox(width: 8),
                    _dropdownChip<String>(
                      value: _sort,
                      hint: l10n.sortRecommended,
                      items: {
                        'recommended': l10n.sortRecommended,
                        'rating': l10n.sortRating,
                        'reviews': l10n.sortReviews,
                        'price': l10n.sortPrice,
                        'experience': l10n.sortExperience,
                        'newest': l10n.sortNewest,
                      },
                      onChanged: (v) {
                        setState(() => _sort = v ?? 'recommended');
                        _load(reset: true);
                      },
                    ),
                    const SizedBox(width: 8),
                    FilterChip(
                      label: Text(l10n.availableOnly),
                      selected: _availableOnly,
                      onSelected: (v) {
                        setState(() => _availableOnly = v);
                        _load(reset: true);
                      },
                    ),
                  ],
                ),
              ),
            ),
            if (_loading)
              const SliverFillRemaining(child: BrandLoaderCentered())
            else if (_error)
              SliverFillRemaining(
                child: ErrorRetry(onRetry: () => _load(reset: true)),
              )
            else if (_providers.isEmpty)
              SliverFillRemaining(
                child: EmptyState(
                  message: l10n.noProvidersFound,
                  icon: Icons.search_off,
                ),
              )
            else
              SliverPadding(
                padding: const EdgeInsets.all(16),
                sliver: SliverList.separated(
                  itemCount: _providers.length + (_hasMore ? 1 : 0),
                  separatorBuilder: (_, _) => const SizedBox(height: 12),
                  itemBuilder: (context, index) {
                    if (index == _providers.length) {
                      return Center(
                        child: OutlinedButton(
                          onPressed: () {
                            _page += 1;
                            _load(reset: false);
                          },
                          child: Text(l10n.loadMore),
                        ),
                      );
                    }
                    return ProviderCard(provider: _providers[index]);
                  },
                ),
              ),
          ],
        ),
      ),
    );
  }

  Widget _dropdownChip<T>({
    required T value,
    required String hint,
    required Map<T, String> items,
    required ValueChanged<T?> onChanged,
  }) {
    return PopupMenuButton<T?>(
      onSelected: onChanged,
      itemBuilder: (_) => [
        PopupMenuItem<T?>(value: null, child: Text(hint)),
        for (final e in items.entries)
          PopupMenuItem<T?>(value: e.key, child: Text(e.value)),
      ],
      child: Chip(
        label: Text(value != null ? items[value] ?? hint : hint),
        deleteIcon: const Icon(Icons.arrow_drop_down),
        onDeleted: null,
      ),
    );
  }
}
