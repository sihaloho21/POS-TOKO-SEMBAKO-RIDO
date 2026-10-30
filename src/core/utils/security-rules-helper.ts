/**
 * Firestore Security Rules Helper & Advisor
 * Provides programmatic security rule suggestions, RBAC mapping, and error diagnosis
 * specifically aligned with the Harapan Jaya POS RBAC hierarchy.
 */

export type AppRole = 'OWNER' | 'MANAGER' | 'KASIR' | 'WAREHOUSE';

export type FirestoreOperation = 'read' | 'get' | 'list' | 'create' | 'update' | 'delete' | 'write';

export interface SecurityRuleSuggestion {
  targetCollection: string;
  documentWildcard: string;
  targetOperation: FirestoreOperation;
  allowedRole: AppRole;
  suggestedRbacFunction: string;
  ruleStatement: string;
  completeMatchBlock: string;
  rationale: string;
  rbacConsistencyNotes: string;
  securityImpact: string[];
}

export interface FirestoreErrorDiagnostic {
  isPermissionError: boolean;
  operationType?: string;
  collectionPath?: string;
  userId?: string | null;
  diagnosticSummary: string;
  suggestedFix?: SecurityRuleSuggestion;
  rawErrorParsed?: any;
}

/**
 * Maps application roles to their corresponding security rule helper functions in firestore.rules.
 * Follows the existing RBAC hierarchy where:
 * - isOwner() checks owner UID, owner email, or users collection role == 'OWNER'
 * - isManager() allows OWNER or users collection role in ['MANAGER', 'OWNER']
 * - isKasir() allows OWNER, MANAGER, or users collection role in ['KASIR', 'MANAGER', 'OWNER']
 * - isWarehouse() allows OWNER, MANAGER, or users collection role in ['WAREHOUSE', 'MANAGER', 'OWNER']
 */
export const RBAC_HELPER_MAP: Record<AppRole, string> = {
  OWNER: 'isOwner()',
  MANAGER: 'isManager()',
  KASIR: 'isKasir()',
  WAREHOUSE: 'isWarehouse()',
};

/**
 * Suggests the required Firestore Security Rule to allow ONLY users with an 'OWNER' role
 * to perform 'delete' operations on the 'products' collection.
 * 
 * Ensures strict consistency with the existing RBAC functions in firestore.rules:
 * - Read remains open to Kasir, Warehouse, and Owner (catalog lookup in POS and warehouse).
 * - Create & Update remain accessible to Kasir, Manager, Warehouse, and Owner (stock adjustments, price updates, incoming goods).
 * - Delete is restricted EXCLUSIVELY to isOwner() to prevent accidental loss of master catalog data,
 *   unauthorized item deletion, and integrity violations with historical transactions.
 */
export function suggestProductDeleteSecurityRule(): SecurityRuleSuggestion {
  const targetCollection = 'products';
  const documentWildcard = '{productId}';
  const targetOperation: FirestoreOperation = 'delete';
  const allowedRole: AppRole = 'OWNER';
  const suggestedRbacFunction = RBAC_HELPER_MAP[allowedRole]; // 'isOwner()'

  const ruleStatement = `allow delete: if ${suggestedRbacFunction};`;

  const completeMatchBlock = [
    `match /${targetCollection}/${documentWildcard} {`,
    `  allow read: if isKasir() || isWarehouse() || isOwner();`,
    `  allow create, update: if isKasir() || isManager() || isWarehouse() || isOwner();`,
    `  ${ruleStatement}`,
    `}`,
  ].join('\n');

  const rationale = 
    `Restricting 'delete' on the 'products' collection strictly to 'isOwner()' ensures that only users with the ` +
    `OWNER role (verified via users/{uid}.role == 'OWNER' or direct owner credentials in firestore.rules) ` +
    `can permanently remove items from the catalog. Operational roles (Kasir, Warehouse) retain read/write access ` +
    `for sales, barcode scanning, and receiving, but cannot erase master records.`;

  const rbacConsistencyNotes = 
    `1. Leverages the existing 'isOwner()' helper already defined in firestore.rules (checking request.auth.uid, email, and role == 'OWNER').\n` +
    `2. Preserves existing read & create/update access for isKasir() and isWarehouse() without breaking POS or Goods Receipt flows.\n` +
    `3. Eliminates privilege escalation where non-owner roles could delete inventory items with past sales history.\n` +
    `4. Directly addresses permission failure when deleting products by non-owners or when rules lack proper owner-only delete guards.`;

  const securityImpact = [
    'Catalog Tampering Prevention: Cashiers and warehouse staff cannot erase product listings.',
    'Referential Integrity: Past transactions referencing productId will not have their master records deleted by unauthorized staff.',
    'Audit Trail Protection: Any product removal requires explicit Owner authority.'
  ];

  return {
    targetCollection,
    documentWildcard,
    targetOperation,
    allowedRole,
    suggestedRbacFunction,
    ruleStatement,
    completeMatchBlock,
    rationale,
    rbacConsistencyNotes,
    securityImpact,
  };
}

/**
 * General helper to generate or suggest security rule configurations for any entity and role,
 * maintaining consistency with the established RBAC helper functions.
 */
export function suggestFirestoreSecurityRule(
  collection: string,
  operation: FirestoreOperation,
  role: AppRole
): SecurityRuleSuggestion {
  if (collection === 'products' && operation === 'delete' && role === 'OWNER') {
    return suggestProductDeleteSecurityRule();
  }

  const rbacFunction = RBAC_HELPER_MAP[role] || 'isOwner()';
  const wildcard = `{${collection.replace(/s$/, '')}Id}`;
  const ruleStatement = `allow ${operation}: if ${rbacFunction};`;

  return {
    targetCollection: collection,
    documentWildcard: wildcard,
    targetOperation: operation,
    allowedRole: role,
    suggestedRbacFunction: rbacFunction,
    ruleStatement,
    completeMatchBlock: `match /${collection}/${wildcard} {\n  ${ruleStatement}\n}`,
    rationale: `Grants ${operation} access on '${collection}' solely to role '${role}' via helper '${rbacFunction}'.`,
    rbacConsistencyNotes: `Utilizes standard ${rbacFunction} helper to evaluate role claims consistently with firestore.rules.`,
    securityImpact: [`Restricts ${operation} on ${collection} to ${role}.`],
  };
}

/**
 * Analyzes a Firestore error message (such as the one reported from System Health sync queue)
 * and produces a diagnostic breakdown along with the suggested Firestore security rule fix.
 */
export function diagnoseFirestorePermissionError(errorInput: unknown): FirestoreErrorDiagnostic {
  let errorObj: any = null;
  const rawString = typeof errorInput === 'string' ? errorInput : JSON.stringify(errorInput);

  try {
    if (typeof errorInput === 'object' && errorInput !== null) {
      errorObj = errorInput;
    } else if (typeof errorInput === 'string') {
      // Find JSON substring if embedded in "Status : FAILED : { ... }"
      const jsonStart = rawString.indexOf('{');
      const jsonEnd = rawString.lastIndexOf('}');
      if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
        errorObj = JSON.parse(rawString.substring(jsonStart, jsonEnd + 1));
      }
    }
  } catch {
    // If not JSON, analyze as plain string
  }

  const isMissingPermission = 
    rawString.includes('Missing or insufficient permissions') ||
    rawString.includes('permission-denied') ||
    errorObj?.error?.includes('Missing or insufficient permissions');

  const operationType = errorObj?.operationType || (rawString.includes('delete') ? 'delete' : undefined);
  const collectionPath = errorObj?.path || (rawString.includes('products') ? 'products' : undefined);
  const userId = errorObj?.authInfo?.userId;

  if (isMissingPermission && collectionPath === 'products' && operationType === 'delete') {
    const suggestedFix = suggestProductDeleteSecurityRule();
    return {
      isPermissionError: true,
      operationType: 'delete',
      collectionPath: 'products',
      userId,
      diagnosticSummary: 
        `Terjadi kegagalan hak akses (Missing or insufficient permissions) saat mencoba melakukan operasi DELETE pada koleksi 'products'. ` +
        `Operasi ini membutuhkan rule 'allow delete: if isOwner();' yang memverifikasi role OWNER pengguna.`,
      suggestedFix,
      rawErrorParsed: errorObj,
    };
  }

  return {
    isPermissionError: isMissingPermission,
    operationType,
    collectionPath,
    userId,
    diagnosticSummary: isMissingPermission 
      ? `Terdeteksi penolakan izin Firestore pada path '${collectionPath || 'unknown'}' untuk operasi '${operationType || 'unknown'}'. Periksa konfigurasi firestore.rules.`
      : `Error tidak berhubungan langsung dengan Firestore Security Rule permissions.`,
    suggestedFix: (collectionPath && operationType) 
      ? suggestFirestoreSecurityRule(collectionPath, operationType as FirestoreOperation, 'OWNER') 
      : undefined,
    rawErrorParsed: errorObj,
  };
}
