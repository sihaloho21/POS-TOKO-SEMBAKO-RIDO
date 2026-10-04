# Security Specification - Toko Sembako Rido

## Data Invariants
1. A transaction must have a valid `cashierId`.
2. A `stockMovement` must be linked to a valid `productId`.
3. Only `OWNER` can view `purchases`, `financeEvents`, and `auditLogs`.
4. `KASIR` can create transactions but cannot void or update them once completed (unless owner).
5. All IDs must match `^[a-zA-Z0-9_\-]+$`.

## The Dirty Dozen Payloads
1. **Identity Spoofing**: Create a transaction with a different user's `cashierId`.
2. **Privilege Escalation**: Update a user's role from `KASIR` to `OWNER`.
3. **Ghost Field Injection**: Add `isAdmin: true` to a user document.
4. **ID Poisoning**: Create a product with a 2KB junk string as ID.
5. **PII Leakage**: Unauthorized reading of customer phone/address by a non-authenticated user.
6. **State Shortcutting**: Updating a transaction status directly to `COMPLETED` without items.
7. **Resource Poisoning**: Sending a 1MB message string in a notification.
8. **Orphaned Record**: Creating a `stockMovement` for a non-existent `productId`.
9. **Timestamp Spoofing**: Providing a `createdAt` in the past instead of `request.time`.
10. **Immutable Violation**: Changing the `transactionId` of an existing transaction.
11. **Sync Bypass**: Writing directly to `auditLogs` as a `KASIR` without an owner role.
12. **Recursive Cost Attack**: Listing all `transactions` without any query filters.

## Test Runner (Logic Check)
- `PERMISSION_DENIED` for any write where `request.auth.uid` doesn't match `cashierId` (for transactions).
- `PERMISSION_DENIED` for `KASIR` attempting to read `/financeEvents`.
- `PERMISSION_DENIED` for any field not in `hasOnly`.
