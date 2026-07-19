import 'package:dio/dio.dart';

import '../models/models.dart';
import 'api_client.dart';

/// Everything the customer app reads/writes through the gateway, minus auth
/// (auth_repository.dart) and the SSE assistant (chat_repository.dart).
/// Endpoint contracts: docs/api/public.md.
class MarketplaceApi {
  MarketplaceApi(this.client);

  final ApiClient client;

  // ---- Directory -----------------------------------------------------------

  Future<List<CategoryOption>> categories() async {
    final res = await client.dio.get('/api/categories');
    final list = res.data is Map ? (res.data as Map)['categories'] : null;
    return [
      if (list is List)
        for (final c in list)
          if (CategoryOption.fromJson(c) case final v?) v,
    ];
  }

  Future<ProviderPage> browse({
    String? q,
    String? category,
    String? district,
    String sort = 'recommended',
    int page = 1,
    int? ratingMin,
    bool availableOnly = false,
    double? lat,
    double? lng,
    double? radiusKm,
  }) async {
    final geo = lat != null && lng != null;
    // Geo search lives on search-service; the plain directory on provider-
    // service. Same envelope either way (#372).
    final res = await client.dio.get(
      geo ? '/api/search/providers' : '/api/providers',
      queryParameters: {
        if (q != null && q.isNotEmpty) 'q': q,
        if (category != null) 'category': category,
        if (district != null) 'district': district,
        'sort': geo ? 'distance' : sort,
        'page': page,
        if (ratingMin != null) 'ratingMin': ratingMin,
        if (availableOnly) 'availableOnly': 'true',
        if (geo) 'lat': lat,
        if (geo) 'lng': lng,
        if (geo && radiusKm != null) 'radiusKm': radiusKm,
      },
    );
    return ProviderPage.fromJson(res.data);
  }

  Future<ProviderDetail?> providerDetail(String id) async {
    final res = await client.dio.get('/api/providers/$id/full');
    if (res.statusCode != 200) return null;
    return ProviderDetail.fromJson(res.data);
  }

  Future<ContactDetails?> revealContact(String providerId) async {
    final res = await client.dio.post('/api/providers/$providerId/contact');
    if (res.statusCode != 200) return null;
    return ContactDetails.fromJson(res.data);
  }

  // ---- Reviews -------------------------------------------------------------

  Future<ReviewPage> reviews(String providerId, {String? cursor}) async {
    final res = await client.dio.get(
      '/api/providers/$providerId/reviews',
      queryParameters: {if (cursor != null) 'cursor': cursor},
    );
    return ReviewPage.fromJson(res.data);
  }

  /// Multipart per the API (photos optional; none sent from v1).
  /// Requires a verified email and a prior inquiry (gates surface as
  /// { error, code } — returned verbatim for the UI dictionary).
  Future<String?> submitReview(
    String providerId, {
    required int rating,
    required String comment,
  }) async {
    final res = await client.dio.post(
      '/api/providers/$providerId/reviews',
      data: FormData.fromMap({'rating': '$rating', 'comment': comment}),
    );
    if (res.statusCode == 200) return null;
    final data = res.data;
    if (data is Map) return (data['code'] ?? data['error'])?.toString();
    return 'error';
  }

  // ---- Inquiries -----------------------------------------------------------

  Future<bool> sendInquiry(
    String providerId, {
    required String name,
    required String phone,
    required String message,
    String? email,
  }) async {
    final res = await client.dio.post(
      '/api/providers/$providerId/inquiries',
      data: {
        'name': name,
        'phone': phone,
        'message': message,
        if (email != null && email.isNotEmpty) 'email': email,
        'source': 'mobile',
      },
    );
    return res.statusCode == 200 || res.statusCode == 201;
  }

  Future<List<Inquiry>> myInquiries() async {
    final res = await client.dio.get('/api/account/inquiries');
    final list = res.data is Map ? (res.data as Map)['inquiries'] : null;
    return [
      if (list is List)
        for (final i in list)
          if (Inquiry.fromJson(i) case final v?) v,
    ];
  }

  Future<List<ThreadMessage>> threadMessages(String inquiryId) async {
    final res = await client.dio.get('/api/inquiries/$inquiryId/messages');
    final list = res.data is Map ? (res.data as Map)['messages'] : res.data;
    return [
      if (list is List)
        for (final m in list)
          if (ThreadMessage.fromJson(m) case final v?) v,
    ];
  }

  Future<bool> sendThreadMessage(String inquiryId, String body) async {
    final res = await client.dio
        .post('/api/inquiries/$inquiryId/messages', data: {'body': body});
    return res.statusCode == 200 || res.statusCode == 201;
  }

  // ---- Favorites -----------------------------------------------------------

  Future<Set<String>> favoriteIds() async {
    final res = await client.dio.get('/api/favorites');
    final list = res.data is Map ? (res.data as Map)['providerIds'] : null;
    return {
      if (list is List)
        for (final id in list)
          if (id is String) id,
    };
  }

  Future<bool> setFavorite(String providerId, bool favorited) async {
    final res = favorited
        ? await client.dio.post('/api/favorites/$providerId')
        : await client.dio.delete('/api/favorites/$providerId');
    return res.statusCode == 200;
  }

  Future<List<ProviderSummary>> providersByIds(Iterable<String> ids) async {
    if (ids.isEmpty) return const [];
    final res = await client.dio
        .get('/api/providers', queryParameters: {'ids': ids.join(',')});
    return ProviderPage.fromJson(res.data).providers;
  }

  // ---- Jobs ----------------------------------------------------------------

  /// Requires a verified email (#115); 403 → 'EMAIL_NOT_VERIFIED', 429 → cap.
  Future<String?> postJob({
    required String category,
    required String district,
    required String title,
    required String description,
    int? budget,
  }) async {
    final res = await client.dio.post('/api/jobs', data: {
      'category': category,
      'district': district,
      'title': title,
      'description': description,
      if (budget != null) 'budget': budget,
    });
    if (res.statusCode == 200 || res.statusCode == 201) return null;
    if (res.statusCode == 403) return 'EMAIL_NOT_VERIFIED';
    if (res.statusCode == 429) return 'RATE_LIMITED';
    final data = res.data;
    if (data is Map) return (data['code'] ?? data['error'])?.toString();
    return 'error';
  }

  Future<List<Job>> myJobs() async {
    final res = await client.dio.get('/api/jobs/mine');
    final list = res.data is Map ? (res.data as Map)['jobs'] : null;
    return [
      if (list is List)
        for (final j in list)
          if (Job.fromJson(j) case final v?) v,
    ];
  }

  Future<bool> setJobStatus(String jobId, String status) async {
    final res =
        await client.dio.patch('/api/jobs/$jobId', data: {'status': status});
    return res.statusCode == 200;
  }

  // ---- Notifications -------------------------------------------------------

  Future<({List<NotificationItem> items, String? nextCursor})> notifications({
    String? cursor,
  }) async {
    final res = await client.dio.get(
      '/api/notifications',
      queryParameters: {if (cursor != null) 'cursor': cursor},
    );
    final map = res.data is Map ? res.data as Map : const {};
    final list = map['notifications'];
    return (
      items: <NotificationItem>[
        if (list is List)
          for (final n in list)
            if (NotificationItem.fromJson(n) case final v?) v,
      ],
      nextCursor: map['nextCursor'] as String?,
    );
  }

  Future<int> unreadCount() async {
    final res = await client.dio.get('/api/notifications/unread-count');
    final data = res.data;
    return data is Map && data['count'] is num ? (data['count'] as num).toInt() : 0;
  }

  Future<void> markRead({List<String>? ids, bool all = false}) async {
    await client.dio.post('/api/notifications/read', data: {
      if (ids != null && ids.isNotEmpty) 'ids': ids,
      if (all) 'all': true,
    });
  }

  // ---- Push devices (#798) -------------------------------------------------

  Future<void> registerDevice(String token, String platform) async {
    await client.dio.post('/api/notifications/devices',
        data: {'token': token, 'platform': platform});
  }

  Future<void> unregisterDevice(String token) async {
    await client.dio
        .delete('/api/notifications/devices', data: {'token': token});
  }
}
