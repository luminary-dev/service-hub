import 'dart:convert';

import 'package:baas_mobile/src/api/chat_repository.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('parseSseEvents', () {
    test('parses events split across arbitrary chunk boundaries', () async {
      const wire = 'data: {"type":"text","text":"Hel"}\n\n'
          'data: {"type":"text","text":"lo"}\n\n'
          'data: {"type":"tool","name":"search_providers"}\n\n'
          'data: {"type":"proposal","proposal":{"providerId":"p1",'
          '"providerName":"Nimal","name":"Kasun","phone":"0771234567",'
          '"message":"Need a plumber"}}\n\n'
          'data: {"type":"done"}\n\n';
      final bytes = utf8.encode(wire);
      // Deliberately awkward chunking: 7 bytes at a time.
      final chunks = <List<int>>[
        for (var i = 0; i < bytes.length; i += 7)
          bytes.sublist(i, i + 7 > bytes.length ? bytes.length : i + 7),
      ];
      final events = await parseSseEvents(Stream.fromIterable(chunks)).toList();

      expect(events, hasLength(5));
      expect((events[0] as ChatText).text, 'Hel');
      expect((events[1] as ChatText).text, 'lo');
      expect((events[2] as ChatToolUse).name, 'search_providers');
      final proposal = events[3] as ChatProposal;
      expect(proposal.providerId, 'p1');
      expect(proposal.message, 'Need a plumber');
      expect(events[4], isA<ChatDone>());
    });

    test('skips malformed and keep-alive lines', () async {
      const wire = ': keep-alive\n\n'
          'data: not-json\n\n'
          'data: {"type":"unknown-kind"}\n\n'
          'data: {"type":"error"}\n\n';
      final events =
          await parseSseEvents(Stream.value(utf8.encode(wire))).toList();
      expect(events, hasLength(1));
      expect(events.single, isA<ChatError>());
    });
  });
}
