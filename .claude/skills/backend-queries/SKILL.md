---
name: Backend Queries
description: Write secure, performant database queries using parameterized queries, eager loading, proper indexing, and transactions. Use this skill when writing database query code, ORM query methods, SQL statements, or data fetching logic. Use this when preventing SQL injection with parameterized queries, optimizing queries to avoid N+1 problems with eager loading, selecting specific columns instead of SELECT *, implementing database transactions for related operations, adding query timeouts, or caching expensive queries. Use this when working on repository files, service files with database access, query builder code, or any file that retrieves or manipulates data from databases.
---

# Backend Queries

This Skill provides Claude Code with specific guidance on how to adhere to coding standards as they relate to how it should handle backend queries.

## When to use this skill:

- When writing database query code using ORM methods or query builders
- When creating repository pattern files that encapsulate data access logic
- When implementing service layer methods that fetch or manipulate database data
- When writing raw SQL queries or stored procedure calls
- When using parameterized queries to prevent SQL injection attacks
- When implementing eager loading or joins to avoid N+1 query problems
- When optimizing queries by selecting specific columns instead of using SELECT *
- When wrapping related database operations in transactions for consistency
- When adding indexes to columns used in WHERE, JOIN, or ORDER BY clauses
- When implementing query timeouts to prevent runaway queries
- When setting up caching strategies for frequently-run or expensive queries

## Instructions

For details, refer to the information provided in this file:
[backend queries](../../../agent-os/standards/backend/queries.md)
