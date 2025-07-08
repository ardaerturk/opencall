# 🤝 Contributing to OpenCall

First off, thank you for considering contributing to OpenCall! It's people like you that make OpenCall such a great tool for protecting privacy and enabling secure communications.

## 📋 Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [How Can I Contribute?](#how-can-i-contribute)
- [Development Setup](#development-setup)
- [Style Guidelines](#style-guidelines)
- [Commit Guidelines](#commit-guidelines)
- [Pull Request Process](#pull-request-process)
- [Community](#community)

## 📜 Code of Conduct

This project and everyone participating in it is governed by the [OpenCall Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code. Please report unacceptable behavior to [conduct@opencall.io](mailto:conduct@opencall.io).

## 🚀 Getting Started

1. **Fork the repository** on GitHub
2. **Clone your fork** locally
3. **Create a branch** for your contribution
4. **Make your changes** with tests
5. **Push to your fork** and submit a pull request

## 🎯 How Can I Contribute?

### 🐛 Reporting Bugs

Before creating bug reports, please check existing issues as you might find out that you don't need to create one. When you are creating a bug report, please include as many details as possible:

**Bug Report Template**:
```markdown
**Describe the bug**
A clear and concise description of what the bug is.

**To Reproduce**
Steps to reproduce the behavior:
1. Go to '...'
2. Click on '....'
3. Scroll down to '....'
4. See error

**Expected behavior**
What you expected to happen.

**Screenshots**
If applicable, add screenshots.

**Environment:**
 - OS: [e.g. macOS 12.0]
 - Browser: [e.g. Chrome 96]
 - Version: [e.g. 1.0.0]

**Additional context**
Add any other context about the problem.
```

### 💡 Suggesting Enhancements

Enhancement suggestions are tracked as GitHub issues. When creating an enhancement suggestion, please include:

- **Use a clear and descriptive title**
- **Provide a step-by-step description** of the suggested enhancement
- **Provide specific examples** to demonstrate the steps
- **Describe the current behavior** and explain which behavior you expected to see instead
- **Explain why this enhancement would be useful**

### 🔧 Your First Code Contribution

Unsure where to begin? You can start by looking through these issues:

- `good first issue` - issues which should only require a few lines of code
- `help wanted` - issues which should be a bit more involved than beginner issues
- `documentation` - issues related to improving documentation

## 💻 Development Setup

### Prerequisites

- Node.js 18+ and pnpm
- Docker and Docker Compose
- Rust (for WASM development)
- Git

### Local Development

```bash
# Clone your fork
git clone https://github.com/your-username/opencall.git
cd opencall

# Add upstream remote
git remote add upstream https://github.com/opencall/opencall.git

# Install dependencies
pnpm install

# Build core packages
pnpm -r build

# Start development servers
pnpm dev

# Run tests
pnpm test

# Run linting
pnpm lint
```

### Project Structure

```
opencall/
├── packages/
│   ├── core/         # Shared types and utilities
│   ├── client/       # React frontend
│   ├── server/       # Node.js backend
│   ├── protocol/     # Crypto implementation
│   └── contracts/    # Smart contracts
├── docs/            # Documentation
├── scripts/         # Build scripts
└── docker/          # Docker configs
```

### Running Specific Services

```bash
# Run only the client
cd packages/client && pnpm dev

# Run only the server
cd packages/server && pnpm dev

# Run with Docker
docker-compose up

# Run specific service
docker-compose up redis
```

## 🎨 Style Guidelines

### TypeScript Style Guide

We use ESLint and Prettier for code formatting. Run `pnpm lint` before committing.

**Key conventions**:
- Use functional components with hooks for React
- Prefer `interface` over `type` for object shapes
- Use explicit return types for functions
- Document public APIs with JSDoc

```typescript
// Good
interface UserProps {
  name: string;
  age: number;
}

export const UserCard: React.FC<UserProps> = ({ name, age }) => {
  return <div>{name} ({age})</div>;
};

// Bad
type UserProps = {
  name: string,
  age: number
}

export const UserCard = (props) => {
  return <div>{props.name} ({props.age})</div>
}
```

### CSS Style Guide

- Use CSS Modules for component styles
- Follow BEM naming for global styles
- Use CSS variables for theming
- Mobile-first responsive design

### Testing Guidelines

- Write tests for all new features
- Maintain >80% code coverage
- Use descriptive test names
- Mock external dependencies

```typescript
describe('MeetingService', () => {
  it('should create a meeting with unique ID', async () => {
    const meeting = await meetingService.create();
    expect(meeting.id).toBeDefined();
    expect(meeting.id).toHaveLength(36); // UUID
  });
});
```

## 📝 Commit Guidelines

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation only
- `style`: Code style changes (formatting, etc)
- `refactor`: Code change that neither fixes a bug nor adds a feature
- `perf`: Performance improvement
- `test`: Adding missing tests
- `chore`: Changes to build process or auxiliary tools

### Examples

```bash
feat(client): add screen sharing support

- Implement screen capture API
- Add UI controls for screen sharing
- Handle screen share state in meeting

Closes #123

fix(server): prevent memory leak in meeting cleanup

The meeting cleanup wasn't properly removing event listeners,
causing a memory leak over time.

refactor(core): simplify encryption service interface

BREAKING CHANGE: encrypt() now returns Promise<ArrayBuffer>
instead of Promise<string>
```

## 🔄 Pull Request Process

1. **Update documentation** for any changed functionality
2. **Add tests** for new features
3. **Ensure all tests pass** with `pnpm test`
4. **Run linting** with `pnpm lint`
5. **Update the README.md** if needed
6. **Request review** from maintainers

### PR Template

```markdown
## Description
Brief description of the changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing
- [ ] Unit tests pass
- [ ] Integration tests pass
- [ ] Manual testing completed

## Checklist
- [ ] My code follows the style guidelines
- [ ] I have performed a self-review
- [ ] I have commented my code where necessary
- [ ] I have updated the documentation
- [ ] My changes generate no new warnings
```

## 🌍 Community

### Communication Channels

- **Discord**: [discord.gg/opencall](https://discord.gg/opencall)
- **GitHub Discussions**: For general discussions
- **Twitter**: [@OpenCallHQ](https://twitter.com/OpenCallHQ)
- **Blog**: [blog.opencall.io](https://blog.opencall.io)

### Getting Help

- Check the [documentation](https://docs.opencall.io)
- Search [existing issues](https://github.com/opencall/opencall/issues)
- Ask in [Discord](https://discord.gg/opencall)
- Open a [discussion](https://github.com/opencall/opencall/discussions)

### Recognition

Contributors are recognized in several ways:
- Listed in [CONTRIBUTORS.md](CONTRIBUTORS.md)
- Mentioned in release notes
- Special Discord roles
- OpenCall swag for significant contributions

## 🏆 Becoming a Maintainer

Regular contributors may be invited to become maintainers. Maintainers:
- Have write access to the repository
- Help review pull requests
- Guide project direction
- Represent OpenCall at events

## 📜 License

By contributing to OpenCall, you agree that your contributions will be licensed under the MIT License.

---

Thank you for contributing to a more private internet! 🔒✨