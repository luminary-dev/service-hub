/// API DTOs. Field names mirror docs/api/public.md; parsing is defensive
/// (nullable + defaults) so additive server changes never crash the app.
library;

String? _str(dynamic v) => v is String ? v : null;
int _int(dynamic v, [int fallback = 0]) => v is num ? v.toInt() : fallback;
double? _dbl(dynamic v) => v is num ? v.toDouble() : null;

class UserAccount {
  const UserAccount({
    required this.id,
    required this.name,
    required this.role,
    this.email,
    this.phone,
    this.avatarUrl,
    this.providerId,
    this.emailVerified = false,
  });

  final String id;
  final String name;
  final String role;
  final String? email;
  final String? phone;
  final String? avatarUrl;
  final String? providerId;
  final bool emailVerified;

  static UserAccount? fromJson(dynamic json) {
    if (json is! Map) return null;
    final id = _str(json['id']);
    if (id == null) return null;
    return UserAccount(
      id: id,
      name: _str(json['name']) ?? '',
      role: _str(json['role']) ?? 'CUSTOMER',
      email: _str(json['email']),
      phone: _str(json['phone']),
      avatarUrl: _str(json['avatarUrl']),
      providerId: _str(json['providerId']),
      // /auth/me sends a timestamp (or null); token responses may omit it.
      emailVerified: json['emailVerified'] != null,
    );
  }
}

class CategoryOption {
  const CategoryOption({
    required this.slug,
    required this.labelEn,
    required this.labelSi,
    this.icon,
  });

  final String slug;
  final String labelEn;
  final String labelSi;
  final String? icon;

  String label(String locale) => locale == 'si' ? labelSi : labelEn;

  static CategoryOption? fromJson(dynamic json) {
    if (json is! Map) return null;
    final slug = _str(json['slug']);
    if (slug == null) return null;
    final en = _str(json['labelEn']) ?? slug;
    return CategoryOption(
      slug: slug,
      labelEn: en,
      labelSi: _str(json['labelSi']) ?? en,
      icon: _str(json['icon']),
    );
  }
}

class ProviderSummary {
  const ProviderSummary({
    required this.id,
    required this.name,
    required this.category,
    required this.district,
    this.headline = '',
    this.headlineSi,
    this.city = '',
    this.experience = 0,
    this.available = true,
    this.avatarUrl,
    this.coverPhoto,
    this.categoryImageUrl,
    this.fromPrice,
    this.fromPriceType,
    this.rating,
    this.reviewCount = 0,
    this.distanceKm,
    this.verificationStatus,
  });

  final String id;
  final String name;
  final String category;
  final String district;
  final String headline;
  final String? headlineSi;
  final String city;
  final int experience;
  final bool available;
  final String? avatarUrl;
  final String? coverPhoto;
  final String? categoryImageUrl;
  final int? fromPrice;
  final String? fromPriceType;
  final double? rating;
  final int reviewCount;
  final double? distanceKm;
  final String? verificationStatus;

  /// Card image priority mirrors the web: own cover, then any work photo
  /// (already folded into coverPhoto server-side), then the trade cover.
  String? get imageUrl => coverPhoto ?? categoryImageUrl;

  static ProviderSummary? fromJson(dynamic json) {
    if (json is! Map) return null;
    final id = _str(json['id']);
    if (id == null) return null;
    return ProviderSummary(
      id: id,
      name: _str(json['name']) ?? '',
      category: _str(json['category']) ?? '',
      district: _str(json['district']) ?? '',
      headline: _str(json['headline']) ?? '',
      headlineSi: _str(json['headlineSi']),
      city: _str(json['city']) ?? '',
      experience: _int(json['experience']),
      available: json['available'] != false,
      avatarUrl: _str(json['avatarUrl']),
      coverPhoto: _str(json['coverPhoto']),
      categoryImageUrl: _str(json['categoryImageUrl']),
      fromPrice: json['fromPrice'] is num ? (json['fromPrice'] as num).toInt() : null,
      fromPriceType: _str(json['fromPriceType']),
      rating: _dbl(json['rating']),
      reviewCount: _int(json['reviewCount']),
      distanceKm: _dbl(json['distanceKm']),
      verificationStatus: _str(json['verificationStatus']),
    );
  }
}

class ProviderPage {
  const ProviderPage({
    required this.providers,
    required this.total,
    required this.page,
    required this.pageSize,
  });

  final List<ProviderSummary> providers;
  final int total;
  final int page;
  final int pageSize;

  bool get hasMore => page * pageSize < total;

  static ProviderPage fromJson(dynamic json) {
    final map = json is Map ? json : const {};
    final list = map['providers'];
    return ProviderPage(
      providers: [
        if (list is List)
          for (final p in list)
            if (ProviderSummary.fromJson(p) case final s?) s,
      ],
      total: _int(map['total']),
      page: _int(map['page'], 1),
      pageSize: _int(map['pageSize'], 12),
    );
  }
}

class ServiceItem {
  const ServiceItem({
    required this.id,
    required this.title,
    this.titleSi,
    this.description,
    this.price,
    this.priceType,
  });

  final String id;
  final String title;
  final String? titleSi;
  final String? description;
  final int? price;
  final String? priceType;

  static ServiceItem? fromJson(dynamic json) {
    if (json is! Map) return null;
    final id = _str(json['id']);
    if (id == null) return null;
    return ServiceItem(
      id: id,
      title: _str(json['title']) ?? '',
      titleSi: _str(json['titleSi']),
      description: _str(json['description']),
      price: json['price'] is num ? (json['price'] as num).toInt() : null,
      priceType: _str(json['priceType']),
    );
  }
}

class ProviderPhoto {
  const ProviderPhoto({required this.url, this.caption});

  final String url;
  final String? caption;

  static ProviderPhoto? fromJson(dynamic json) {
    if (json is! Map) return null;
    final url = _str(json['url']);
    if (url == null) return null;
    return ProviderPhoto(url: url, caption: _str(json['caption']));
  }
}

class ProviderDetail {
  const ProviderDetail({
    required this.summary,
    this.bio = '',
    this.bioSi,
    this.services = const [],
    this.photos = const [],
    this.reviews = const ReviewPage(reviews: [], nextCursor: null, summary: null),
    this.favorited = false,
    this.hasPhone = false,
    this.hasWhatsapp = false,
    this.hasEmail = false,
    this.serviceDistricts = const [],
  });

  final ProviderSummary summary;
  final String bio;
  final String? bioSi;
  final List<ServiceItem> services;
  final List<ProviderPhoto> photos;
  final ReviewPage reviews;
  final bool favorited;
  final bool hasPhone;
  final bool hasWhatsapp;
  final bool hasEmail;
  final List<String> serviceDistricts;

  static ProviderDetail? fromJson(dynamic json) {
    if (json is! Map) return null;
    // /providers/:id/full nests everything on the provider object.
    final p = json['provider'] is Map ? json['provider'] as Map : json;
    final summary = ProviderSummary.fromJson(p);
    if (summary == null) return null;
    final services = p['services'] ?? json['services'];
    final photos = p['photos'] ?? json['photos'];
    return ProviderDetail(
      summary: summary,
      bio: _str(p['bio']) ?? _str(p['description']) ?? '',
      bioSi: _str(p['bioSi']),
      services: [
        if (services is List)
          for (final s in services)
            if (ServiceItem.fromJson(s) case final v?) v,
      ],
      photos: [
        if (photos is List)
          for (final s in photos)
            if (ProviderPhoto.fromJson(s) case final v?) v,
      ],
      reviews: ReviewPage.fromJson(json['reviews'] ?? p['reviews']),
      favorited: (json['favorited'] ?? p['favorited']) == true,
      hasPhone: (json['hasPhone'] ?? p['hasPhone']) == true,
      hasWhatsapp: (json['hasWhatsapp'] ?? p['hasWhatsapp']) == true,
      hasEmail: (json['hasEmail'] ?? p['hasEmail']) == true,
      serviceDistricts: [
        if ((p['serviceDistricts'] ?? json['serviceDistricts']) case final List l)
          for (final d in l)
            if (d is String) d,
      ],
    );
  }
}

class ContactDetails {
  const ContactDetails({this.phone, this.whatsapp, this.phone2, this.email});

  final String? phone;
  final String? whatsapp;
  final String? phone2;
  final String? email;

  static ContactDetails fromJson(dynamic json) {
    final map = json is Map ? json : const {};
    return ContactDetails(
      phone: _str(map['phone']),
      whatsapp: _str(map['whatsapp']),
      phone2: _str(map['phone2']),
      email: _str(map['email']),
    );
  }
}

class Review {
  const Review({
    required this.id,
    required this.rating,
    required this.comment,
    required this.createdAt,
    this.authorName = '',
    this.responseText,
    this.photos = const [],
  });

  final String id;
  final int rating;
  final String comment;
  final String createdAt;
  final String authorName;
  final String? responseText;
  final List<String> photos;

  static Review? fromJson(dynamic json) {
    if (json is! Map) return null;
    final id = _str(json['id']);
    if (id == null) return null;
    final response = json['response'];
    final photos = json['photos'];
    return Review(
      id: id,
      rating: _int(json['rating']),
      comment: _str(json['comment']) ?? '',
      createdAt: _str(json['createdAt']) ?? '',
      authorName: _str(json['authorName']) ?? _str(json['userName']) ?? '',
      responseText: response is Map ? _str(response['text']) : null,
      photos: [
        if (photos is List)
          for (final p in photos)
            if (p is String)
              p
            else if (p is Map && p['url'] is String)
              p['url'] as String,
      ],
    );
  }
}

class ReviewSummary {
  const ReviewSummary({this.rating, this.count = 0});

  final double? rating;
  final int count;

  static ReviewSummary fromJson(dynamic json) {
    final map = json is Map ? json : const {};
    return ReviewSummary(
      rating: _dbl(map['rating'] ?? map['avgRating']),
      count: _int(map['count'] ?? map['reviewCount']),
    );
  }
}

class ReviewPage {
  const ReviewPage({
    required this.reviews,
    required this.nextCursor,
    required this.summary,
  });

  final List<Review> reviews;
  final String? nextCursor;
  final ReviewSummary? summary;

  static ReviewPage fromJson(dynamic json) {
    final map = json is Map ? json : const {};
    final list = map['reviews'];
    return ReviewPage(
      reviews: [
        if (list is List)
          for (final r in list)
            if (Review.fromJson(r) case final v?) v,
      ],
      nextCursor: _str(map['nextCursor'] ?? map['reviewsNextCursor']),
      summary: map['summary'] is Map ? ReviewSummary.fromJson(map['summary']) : null,
    );
  }
}

class Inquiry {
  const Inquiry({
    required this.id,
    required this.message,
    required this.createdAt,
    this.provider,
    this.status,
    this.unreadCount = 0,
  });

  final String id;
  final String message;
  final String createdAt;
  final InquiryProvider? provider;
  final String? status;
  final int unreadCount;

  static Inquiry? fromJson(dynamic json) {
    if (json is! Map) return null;
    final id = _str(json['id']);
    if (id == null) return null;
    return Inquiry(
      id: id,
      message: _str(json['message']) ?? '',
      createdAt: _str(json['createdAt']) ?? '',
      provider: InquiryProvider.fromJson(json['provider']),
      status: _str(json['status']),
      unreadCount: _int(json['unreadCount']),
    );
  }
}

class InquiryProvider {
  const InquiryProvider({
    required this.id,
    required this.name,
    this.category = '',
    this.suspended = false,
  });

  final String id;
  final String name;
  final String category;
  final bool suspended;

  static InquiryProvider? fromJson(dynamic json) {
    if (json is! Map) return null;
    final id = _str(json['id']);
    if (id == null) return null;
    return InquiryProvider(
      id: id,
      name: _str(json['name']) ?? '',
      category: _str(json['category']) ?? '',
      suspended: json['suspended'] == true,
    );
  }
}

class ThreadMessage {
  const ThreadMessage({
    required this.id,
    required this.body,
    required this.createdAt,
    required this.fromProvider,
  });

  final String id;
  final String body;
  final String createdAt;
  final bool fromProvider;

  static ThreadMessage? fromJson(dynamic json) {
    if (json is! Map) return null;
    final id = _str(json['id']);
    if (id == null) return null;
    return ThreadMessage(
      id: id,
      body: _str(json['body']) ?? '',
      createdAt: _str(json['createdAt']) ?? '',
      fromProvider:
          json['fromProvider'] == true || _str(json['sender']) == 'PROVIDER',
    );
  }
}

class Job {
  const Job({
    required this.id,
    required this.title,
    required this.category,
    required this.district,
    required this.status,
    this.description = '',
    this.budget,
    this.createdAt = '',
    this.responses = const [],
  });

  final String id;
  final String title;
  final String category;
  final String district;
  final String status;
  final String description;
  final int? budget;
  final String createdAt;
  final List<JobResponse> responses;

  static Job? fromJson(dynamic json) {
    if (json is! Map) return null;
    final id = _str(json['id']);
    if (id == null) return null;
    final responses = json['responses'];
    return Job(
      id: id,
      title: _str(json['title']) ?? '',
      category: _str(json['category']) ?? '',
      district: _str(json['district']) ?? '',
      status: _str(json['status']) ?? 'OPEN',
      description: _str(json['description']) ?? '',
      budget: json['budget'] is num ? (json['budget'] as num).toInt() : null,
      createdAt: _str(json['createdAt']) ?? '',
      responses: [
        if (responses is List)
          for (final r in responses)
            if (JobResponse.fromJson(r) case final v?) v,
      ],
    );
  }
}

class JobResponse {
  const JobResponse({
    required this.id,
    required this.message,
    this.providerId,
    this.providerName = '',
    this.createdAt = '',
  });

  final String id;
  final String message;
  final String? providerId;
  final String providerName;
  final String createdAt;

  static JobResponse? fromJson(dynamic json) {
    if (json is! Map) return null;
    final id = _str(json['id']);
    if (id == null) return null;
    final provider = json['provider'];
    return JobResponse(
      id: id,
      message: _str(json['message']) ?? '',
      providerId: _str(json['providerId']) ??
          (provider is Map ? _str(provider['id']) : null),
      providerName: provider is Map ? _str(provider['name']) ?? '' : '',
      createdAt: _str(json['createdAt']) ?? '',
    );
  }
}

class NotificationItem {
  const NotificationItem({
    required this.id,
    required this.type,
    required this.payload,
    this.link,
    this.readAt,
    this.createdAt = '',
  });

  final String id;
  final String type;
  final Map<String, dynamic> payload;
  final String? link;
  final String? readAt;
  final String createdAt;

  bool get unread => readAt == null;

  static NotificationItem? fromJson(dynamic json) {
    if (json is! Map) return null;
    final id = _str(json['id']);
    if (id == null) return null;
    return NotificationItem(
      id: id,
      type: _str(json['type']) ?? '',
      payload: json['payload'] is Map
          ? Map<String, dynamic>.from(json['payload'] as Map)
          : const {},
      link: _str(json['link']),
      readAt: _str(json['readAt']),
      createdAt: _str(json['createdAt']) ?? '',
    );
  }
}
