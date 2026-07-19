import 'dart:async';
import 'dart:convert';

import 'package:dio/dio.dart';

import '../config.dart';
import 'api_client.dart';

/// One SSE event from the assistant stream (docs/api/public.md, chat section).
sealed class ChatEvent {
  const ChatEvent();

  static ChatEvent? fromJson(Map<String, dynamic> json) {
    switch (json['type']) {
      case 'text':
        final text = json['text'];
        return text is String ? ChatText(text) : null;
      case 'tool':
        return ChatToolUse(json['name'] as String? ?? '');
      case 'proposal':
        final p = json['proposal'];
        if (p is Map) {
          return ChatProposal(
            providerId: p['providerId'] as String? ?? '',
            providerName: p['providerName'] as String? ?? '',
            name: p['name'] as String? ?? '',
            phone: p['phone'] as String? ?? '',
            message: p['message'] as String? ?? '',
          );
        }
        return null;
      case 'done':
        return const ChatDone();
      case 'error':
        return const ChatError();
      default:
        return null;
    }
  }
}

class ChatText extends ChatEvent {
  const ChatText(this.text);
  final String text;
}

class ChatToolUse extends ChatEvent {
  const ChatToolUse(this.name);
  final String name;
}

/// An inquiry draft the user must explicitly confirm — the assistant never
/// writes; confirming fires a normal POST /providers/:id/inquiries.
class ChatProposal extends ChatEvent {
  const ChatProposal({
    required this.providerId,
    required this.providerName,
    required this.name,
    required this.phone,
    required this.message,
  });

  final String providerId;
  final String providerName;
  final String name;
  final String phone;
  final String message;
}

class ChatDone extends ChatEvent {
  const ChatDone();
}

class ChatError extends ChatEvent {
  const ChatError();
}

/// Splits an SSE byte stream into `data:` JSON payloads. Exposed for tests.
Stream<ChatEvent> parseSseEvents(Stream<List<int>> bytes) async* {
  var buffer = '';
  await for (final chunk in bytes.transform(utf8.decoder)) {
    buffer += chunk;
    while (buffer.contains('\n\n')) {
      final idx = buffer.indexOf('\n\n');
      final raw = buffer.substring(0, idx);
      buffer = buffer.substring(idx + 2);
      for (final line in raw.split('\n')) {
        if (!line.startsWith('data:')) continue;
        try {
          final json = jsonDecode(line.substring(5).trim());
          if (json is Map<String, dynamic>) {
            final event = ChatEvent.fromJson(json);
            if (event != null) yield event;
          }
        } catch (_) {
          // Partial/keep-alive line — skip.
        }
      }
    }
  }
}

/// The assistant streams through the web app (`POST /agent/chat`), not the
/// gateway — the gateway buffers, which breaks SSE. Auth is the same Bearer
/// access token (#801).
class ChatRepository {
  ChatRepository(this.client);

  final ApiClient client;

  Future<Stream<ChatEvent>> send(
    List<({String role, String content})> messages,
  ) async {
    final token = await client.accessToken();
    if (token == null) throw StateError('signed-out');
    final res = await Dio().post<ResponseBody>(
      '${AppConfig.webBaseUrl}/agent/chat',
      data: jsonEncode({
        'messages': [
          for (final m in messages) {'role': m.role, 'content': m.content},
        ],
      }),
      options: Options(
        responseType: ResponseType.stream,
        headers: {
          'content-type': 'application/json',
          'authorization': 'Bearer $token',
          'cookie': 'lang=${client.locale}',
        },
        validateStatus: (s) => s != null && s < 500,
      ),
    );
    if (res.statusCode != 200 || res.data == null) {
      throw StateError('assistant-unavailable');
    }
    return parseSseEvents(res.data!.stream);
  }
}
