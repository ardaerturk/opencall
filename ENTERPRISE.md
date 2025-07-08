# OpenCall Enterprise Edition

This document explains the separation between the open source and enterprise editions of OpenCall.

## Open Source Edition (This Repository)

The open source edition includes:
- ✅ Core video conferencing functionality
- ✅ End-to-end encryption with MLS protocol
- ✅ P2P and SFU modes
- ✅ Basic authentication
- ✅ Up to 100 participants
- ✅ Community support

## Enterprise Edition (Private)

The enterprise edition adds:
- 🏢 Multi-tenant architecture
- 🔐 SSO/SAML authentication (Okta, Azure AD, Google Workspace)
- 📊 Advanced analytics and reporting
- 📝 Audit logging for compliance
- 🔍 GDPR/HIPAA compliance tools
- 🪝 Webhook integrations
- 👥 Dedicated support
- 🎯 Custom branding
- 📈 No participant limits

## Directory Structure

Enterprise features are excluded from this repository and maintained privately:

```
packages/server/src/
├── auth/
│   ├── sso/                    # Enterprise SSO
│   └── enterprise/             # Multi-tenant auth
├── api/
│   ├── enterprise/             # Enterprise API endpoints
│   └── webhooks/               # Webhook service
├── audit/                      # Audit logging
├── compliance/                 # Compliance features
└── services/
    ├── audit/                  # Audit service
    └── compliance/             # Compliance service
```

## For Enterprise Customers

If you're interested in enterprise features, please contact:
- Email: enterprise@opencall.io
- Website: https://opencall.io/enterprise

## For Contributors

The open source version is fully functional without enterprise features. When contributing:

1. Focus on core functionality improvements
2. Don't add features that belong in the enterprise edition
3. Keep the codebase modular to support both editions
4. Follow the existing patterns for extensibility

## Building Without Enterprise Features

The open source version builds and runs without any enterprise dependencies:

```bash
# Install dependencies
pnpm install

# Run development server
pnpm dev

# Build for production
pnpm build
```

All core features work out of the box without enterprise modules.