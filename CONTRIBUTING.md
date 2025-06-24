# Contributing

Thank you for your interest in contributing to the Decentralized Meeting Platform.

## Code of Conduct

- Be respectful and constructive
- Focus on the issue, not the person
- Accept feedback gracefully
- Help others when you can

## How Can I Contribute?

### Reporting Bugs

Before reporting, check if the issue already exists. Include:

- Clear title and description
- Steps to reproduce
- Expected vs actual behavior
- Environment details (OS, browser, Node version)
- Error messages or screenshots if applicable

### Feature Requests

Open an issue with:

- Clear use case description
- Why this feature is needed
- How it fits with project goals
- Possible implementation approach

### Pull Requests

1. Fork the repo and create your branch from `main`
2. If you've added code that should be tested, add tests
3. If you've changed APIs, update the documentation
4. Ensure the test suite passes
5. Make sure your code lints
6. Issue that pull request!

## Development Setup

1. Fork and clone the repository
2. Install dependencies: `pnpm install`
3. Copy `.env.example` to `.env`
4. Start Docker services: `docker-compose up -d`
5. Run development: `pnpm dev`

### Code Standards

- TypeScript with strict mode
- No `any` types
- Tests for new features (80% coverage minimum)
- Clear variable and function names
- Comments for complex logic only

### Commit Messages

We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation only changes
- `style:` Code style changes (formatting, etc)
- `refactor:` Code change that neither fixes a bug nor adds a feature
- `perf:` Performance improvement
- `test:` Adding missing tests
- `chore:` Changes to the build process or auxiliary tools

Examples:
```
feat: add MLS group encryption support
fix: resolve WebRTC connection timeout issue
docs: update README with deployment instructions
```

### Branches

- `feature/description` - new features
- `fix/description` - bug fixes
- `docs/description` - documentation only
- `refactor/description` - code improvements

## Project Structure

- `/packages/core` - Shared types and utilities
- `/packages/client` - React frontend
- `/packages/server` - Node.js backend
- `/packages/contracts` - Smart contracts
- `/packages/protocol` - P2P and encryption logic

When adding features:
1. Discuss in an issue first
2. Keep changes focused
3. Add tests
4. Update relevant documentation

## Security

- Never commit secrets or keys
- Use environment variables
- Validate all inputs
- Report security issues privately

## Getting Help

- Check existing issues and discussions
- Ask clear, specific questions
- Provide context and examples

## License

By contributing, you agree that your contributions will be licensed under the MIT License.