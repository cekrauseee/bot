# Project

## Purpose

myBot is a portfolio project for an AI agent inspired by the clarity and restraint of products such as ChatGPT and Grok. The product will use a React frontend and a Python backend while keeping provider and infrastructure decisions explicit.

## Scope

The current implementation includes:

- a Vite and React frontend;
- lazy-loaded public login and protected root pages;
- light and dark appearances with the system preference as the default;
- beUI inputs, buttons, and theme transition installed through its shadcn registry;
- a FastAPI application with health and authentication endpoints;
- passwordless email OTP and Google OpenID Connect login;
- PostgreSQL user, identity, and session persistence;
- Redis-backed OTP challenges and abuse limits;
- a React Email template sent through Resend.

Agent conversations, model integration, and production deployment are not implemented yet.

## Core Concepts

- **Polyglot monorepo:** web and API share one product lifecycle while retaining independent package managers.
- **Feature-based frontend:** pages compose domain features, while reusable infrastructure and brand components remain shared.
- **Registry-owned UI source:** beUI components are copied into the application by the shadcn CLI and reviewed as local source.
- **Progressive backend:** the API exposes only verified behavior; new domains add their own routers and tests.

## Boundaries

- Browser authentication uses opaque `HttpOnly` cookies. It does not store credentials in web storage.
- The web and API origins must be sibling subdomains in production.
- beUI components must be added or updated through the `@beui` registry, not copied manually.
- Light and dark colors come from semantic Tailwind tokens, not component-level color overrides.
- Foundational dependencies use current stable releases unless a documented constraint requires otherwise.
