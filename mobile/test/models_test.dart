import 'package:baas_mobile/src/models/models.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('ProviderPage', () {
    test('parses the browse envelope (#372)', () {
      final page = ProviderPage.fromJson({
        'providers': [
          {
            'id': 'p1',
            'name': 'Nimal Perera',
            'category': 'plumbing',
            'district': 'Colombo',
            'city': 'Nugegoda',
            'experience': 7,
            'available': true,
            'fromPrice': 2500,
            'fromPriceType': 'HOURLY',
            'rating': 4.5,
            'reviewCount': 12,
            'coverPhoto': '/api/files/provider/p1/cover.jpg',
          },
          {'not-a-provider': true},
        ],
        'total': 40,
        'page': 2,
        'pageSize': 12,
      });
      expect(page.providers, hasLength(1));
      expect(page.providers.first.name, 'Nimal Perera');
      expect(page.providers.first.fromPrice, 2500);
      expect(page.providers.first.rating, 4.5);
      expect(page.total, 40);
      expect(page.hasMore, isTrue); // 2 * 12 < 40
    });

    test('hasMore false on the last page', () {
      final page = ProviderPage.fromJson(
          {'providers': [], 'total': 24, 'page': 2, 'pageSize': 12});
      expect(page.hasMore, isFalse);
    });

    test('tolerates a malformed body', () {
      final page = ProviderPage.fromJson('oops');
      expect(page.providers, isEmpty);
      expect(page.total, 0);
    });
  });

  group('ProviderDetail', () {
    test('parses the /full shape with nested provider', () {
      final detail = ProviderDetail.fromJson({
        'provider': {
          'id': 'p1',
          'name': 'Nimal',
          'category': 'plumbing',
          'district': 'Colombo',
          'bio': 'Two decades of pipework.',
          'services': [
            {'id': 's1', 'title': 'Leak repair', 'price': 3000},
          ],
          'photos': [
            {'url': '/api/files/provider/p1/1.jpg', 'caption': null},
          ],
        },
        'reviews': {
          'reviews': [
            {'id': 'r1', 'rating': 5, 'comment': 'Great', 'createdAt': 'x'},
          ],
          'nextCursor': null,
          'summary': {'rating': 4.8, 'count': 20},
        },
        'favorited': true,
        'hasPhone': true,
      });
      expect(detail, isNotNull);
      expect(detail!.summary.id, 'p1');
      expect(detail.bio, contains('pipework'));
      expect(detail.services.single.price, 3000);
      expect(detail.photos.single.url, contains('/api/files/'));
      expect(detail.reviews.reviews.single.rating, 5);
      expect(detail.reviews.summary?.count, 20);
      expect(detail.favorited, isTrue);
      expect(detail.hasPhone, isTrue);
    });
  });

  group('UserAccount', () {
    test('emailVerified from timestamp-or-null', () {
      expect(
        UserAccount.fromJson({'id': 'u1', 'name': 'A', 'role': 'CUSTOMER',
            'emailVerified': '2026-01-01T00:00:00Z'})!.emailVerified,
        isTrue,
      );
      expect(
        UserAccount.fromJson({'id': 'u1', 'name': 'A', 'role': 'CUSTOMER',
            'emailVerified': null})!.emailVerified,
        isFalse,
      );
    });
  });

  group('NotificationItem', () {
    test('unread derives from readAt', () {
      final n = NotificationItem.fromJson({
        'id': 'n1',
        'type': 'THREAD_REPLY',
        'payload': {'providerName': 'Nimal', 'preview': 'On my way'},
        'link': '/account/inquiries',
        'readAt': null,
        'createdAt': 'x',
      });
      expect(n!.unread, isTrue);
      expect(n.payload['preview'], 'On my way');
    });
  });
}
