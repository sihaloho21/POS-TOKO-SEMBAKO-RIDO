# Security Specification - Harapan Jaya POS

## 1. Data Invariants
- **Append-Only Ledgers**: FinanceEvents, StockMovements, and AuditLogs are append-only. No deletion or direct editing of existing events allowed.
- **WAC Integrity**: Historical HPP/WAC snapshots in transactions must never change once the transaction is COMPLETED.
- **Identity Lock**: Every event (Transaction, FinanceEvent, etc.) must be linked to a valid User ID and Device ID.
- **Role Isolation**: Only 'OWNER' can read HPP, Profit, and Total Liquid Assets. 'KASIR' is limited to sales-related data and their own shift reconciliation.
- **Atomic Sync**: SyncQueue items are processed idempotently based on their unique Global ID.

## 2. The "Dirty Dozen" Payloads (Attacks)
1. **HPP Leak**: Kasir tries to fetch `product_costs` collection. (Expected: PERMISSION_DENIED)
2. **Ledger Erasure**: User tries to DELETE a FinanceEvent. (Expected: PERMISSION_DENIED)
3. **Price Manipulation**: Kasir tries to UPDATE `normalPrice` in a Product document. (Expected: PERMISSION_DENIED - Only Owner can edit master data)
4. **Historical Re-writing**: User tries to UPDATE the `total` of a COMPLETED transaction from 3 days ago. (Expected: PERMISSION_DENIED)
5. **Role Escalation**: Kasir tries to UPDATE their own `role` to 'OWNER' in the `users` collection. (Expected: PERMISSION_DENIED)
6. **Balance Faking**: User tries to CREATE a FinanceEvent with a backdated timestamp. (Expected: PERMISSION_DENIED - Must use server time)
7. **Ghost Sale**: Kasir tries to CREATE a Transaction without an active Shift document. (Expected: PERMISSION_DENIED)
8. **Inventory Poisoning**: User tries to CREATE a StockMovement with an invalid `productId`. (Expected: PERMISSION_DENIED)
9. **Debt Wipe**: User tries to DELETE a Receivable (Debt) document. (Expected: PERMISSION_DENIED - Must use Reversal event)
10. **Loyalty Injection**: User tries to CREATE a LoyaltyEvent with 1,000,000 points. (Expected: PERMISSION_DENIED - Limit checks)
11. **Multi-device Override**: Device A tries to UPDATE a document that Device B already modified with a higher version/timestamp. (Expected: Conflict check)
12. **Shadow Audit**: User tries to CREATE an AuditLog entry that hides a previous action. (Expected: PERMISSION_DENIED - System managed)

## 3. Test Runner Invariants
The `firestore.rules` will be validated against these pillars:
- `isSignedIn()`: Must be authenticated.
- `isOwner()`: Verified via a trusted `users/{uid}` document where `role == 'OWNER'`.
- `isValidId()`: Path variables must follow strict patterns.
- `immutable()`: Fields like `createdAt` cannot change.
- `serverTimestamp()`: Use `request.time` for all temporal logic.
