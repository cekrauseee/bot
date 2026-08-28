# Project

## Purpose

myBot is a portfolio project for an AI agent inspired by the clarity and restraint of products such as ChatGPT and Grok. The product uses a React frontend, a Node.js application API, and a separate Python AI service while keeping provider and infrastructure decisions explicit.

## Scope

The current implementation includes:

- a Vite and React frontend;
- lazy-loaded public login and protected root pages;
- light and dark appearances with the system preference as the default;
- beUI inputs, buttons, and theme transition installed through its shadcn registry;
- an Elysia application API with health and authentication endpoints;
- an independent FastAPI boundary for future model capabilities;
- passwordless email OTP and Google OpenID Connect login;
- PostgreSQL user, identity, and session persistence;
- Redis-backed OTP challenges and abuse limits;
- a repository-owned React Email component rendered locally and sent through Resend.

Agent conversations, model integration, and production deployment are not implemented yet.

## Core Concepts

- **Polyglot monorepo:** web, application API, email, and AI services share one product lifecycle while retaining appropriate runtimes and package managers.
- **Feature-based frontend:** pages compose domain features, while reusable infrastructure and brand components remain shared.
- **Registry-owned UI source:** beUI components are copied into the application by the shadcn CLI and reviewed as local source.
- **Separated backends:** Node.js owns product data and HTTP behavior; Python is reserved for model-provider and AI workloads.
- **Progressive backend:** each service exposes only verified behavior; new domains add their own feature modules and tests.

## Boundaries

- Browser authentication uses opaque `HttpOnly` cookies. It does not store credentials in web storage.
- The web and API origins must be sibling subdomains in production.
- beUI components must be added or updated through the `@beui` registry, not copied manually.
- Light and dark colors come from semantic Tailwind tokens, not component-level color overrides.
- Foundational dependencies use current stable releases unless a documented constraint requires otherwise.
