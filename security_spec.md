# Security Specification - Toko Sembako Rido

## 1. Data Invariants
- A `Transaction` must be created by a valid `User` with either `OWNER` or `KASIR` role.
- A `StockMovement` or `FinanceEvent` must be linked to a `Transaction` or `Purchase`.
- Users cannot change their own roles or PIN hashes once created.
- Only `OWNER` can modify product HPP or perform stock adjustments.
- `Transaction` status cannot be moved back from `COMPLETED` to `PENDING`.

## 2. The "Dirty Dozen" Payloads (Red Team Test Cases)
1. **Identity Spoofing**: Kasir trying to create a transaction with `cashierId` of an Owner.
2. **Privilege Escalation**: Kasir trying to update their own role to `OWNER`.
3. **State Shortcutting**: Creating a `Transaction` directly as `VOIDED` without a reference.
4. **Resource Poisoning**: Injecting a 2MB string into a `barcode` field.
5. **Unauthorized HPP Access**: Kasir trying to read the `hpp` field of a `Product`.
6. **Orphaned Movement**: Creating a `StockMovement` without an existing `productId`.
7. **Timestamp Spoofing**: Sending a `createdAt` date from 1970.
8. **Shadow Field Injection**: Adding an `isAdmin: true` field to a user profile.
9. **Direct Balance Edit**: Trying to update a calculated balance instead of adding an event.
10. **Cross-User Leak**: Kasir trying to read the `pinHash` of another user.
11. **Malicious ID Injection**: Creating a document with ID `../../secrets`.
12. **Double Posting**: Attempting to create two `FinanceEvent`s with the same ID for one transaction.

## 3. Implementation Plan
- Use `isValidId` for all path variables.
- Implement `isValidUser`, `isValidProduct`, `isValidTransaction`, etc.
- Use `affectedKeys().hasOnly()` for updates.
- Restrict `hpp` field visibility to `OWNER`.
- Enforce `request.time` for all timestamps.
