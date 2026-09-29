# Data Vault

Backend server for an anonymous health-metrics portal. Participants submit
health data against a Kit ID rather than a name, so records can be stored and
analyzed without holding identifying information. Records are encrypted before
they reach the database.

Capstone project ENG4001, Algonquin College.

## Overview

The server is written in Go and backed by PostgreSQL. Authentication uses a Kit
ID paired with a TOTP authenticator app (Google or Microsoft Authenticator)
instead of a password — a participant never has to register an email address or
remember a credential, which keeps the account anonymous and removes password
reset as an attack surface.

Record contents are encrypted server-side using AWS KMS envelope encryption:
each record gets its own data encryption key, wrapped by a KMS master key, with
AES-256-GCM as the record cipher.

CONTENT TO BE ADDED
