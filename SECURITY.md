# Security Policy

Baas.lk is a public repository, but the application it powers handles sensitive
data: user accounts, passwords and JWT sessions, password-reset flows, and
identity-verification documents (NIC / business documents uploaded by
professionals). We take vulnerability reports seriously and appreciate
responsible disclosure.

## Supported versions

The project is pre-1.0. Only the latest `0.1.x` release line receives security
fixes; older tags do not.

| Version | Supported |
| --- | --- |
| `0.1.x` | ✅ |
| < `0.1.0` | ❌ |

## Reporting a vulnerability

Please report suspected vulnerabilities **privately**:

- Email **security@baas.lk**.
  > ⚠️ **Placeholder** — this address needs to be confirmed / provisioned
  > before launch. If it bounces, open a private
  > [GitHub Security Advisory](https://github.com/luminary-dev/service-hub/security/advisories/new)
  > instead.
- Alternatively, use GitHub's **"Report a vulnerability"** button on the
  Security tab to open a private advisory.

Include enough detail to reproduce: affected endpoint or component, steps,
impact, and any proof-of-concept. If the issue touches auth, sessions, or the
handling of verification documents, please say so — we triage those first.

## What NOT to do

- **Do not open a public GitHub issue** for a security vulnerability — public
  issues are for non-sensitive bugs and feature requests only.
- Do not disclose the issue publicly (blog, social media, conference) until we
  have shipped a fix and agreed on a disclosure timeline.
- Do not access, modify, or exfiltrate other users' data, and do not run
  automated scans against production infrastructure.

## What to expect

- **Acknowledgement within 72 hours** of your report.
- An initial assessment and severity triage shortly after.
- Regular updates on remediation progress, and credit in the release notes /
  advisory once the fix ships (unless you prefer to remain anonymous).

Thank you for helping keep Baas.lk and its users safe.
