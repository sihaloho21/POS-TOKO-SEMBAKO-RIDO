import { 
  suggestProductDeleteSecurityRule, 
  suggestFirestoreSecurityRule, 
  diagnoseFirestorePermissionError,
  RBAC_HELPER_MAP 
} from './security-rules-helper';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

console.log('--- RUNNING SECURITY RULES HELPER TESTS ---');

// Test 1: suggestProductDeleteSecurityRule returns correct rule statement and RBAC mapping
{
  const res = suggestProductDeleteSecurityRule();
  assert(res.targetCollection === 'products', 'Target collection must be products');
  assert(res.targetOperation === 'delete', 'Target operation must be delete');
  assert(res.allowedRole === 'OWNER', 'Allowed role must be OWNER');
  assert(res.suggestedRbacFunction === 'isOwner()', 'RBAC function must be isOwner()');
  assert(res.ruleStatement === 'allow delete: if isOwner();', 'Rule statement must match exactly');
  assert(res.completeMatchBlock.includes('allow delete: if isOwner();'), 'Complete match block must include rule statement');
  assert(res.completeMatchBlock.includes('allow read: if isKasir() || isWarehouse() || isOwner();'), 'Complete match block must maintain read');
  assert(res.completeMatchBlock.includes('allow create, update: if isKasir() || isManager() || isWarehouse() || isOwner();'), 'Complete match block must maintain write');
  console.log('✓ Test 1 Passed: suggestProductDeleteSecurityRule generates accurate OWNER-only delete rule');
}

// Test 2: RBAC mapping consistency
{
  assert(RBAC_HELPER_MAP.OWNER === 'isOwner()', 'OWNER maps to isOwner()');
  assert(RBAC_HELPER_MAP.MANAGER === 'isManager()', 'MANAGER maps to isManager()');
  assert(RBAC_HELPER_MAP.KASIR === 'isKasir()', 'KASIR maps to isKasir()');
  assert(RBAC_HELPER_MAP.WAREHOUSE === 'isWarehouse()', 'WAREHOUSE maps to isWarehouse()');
  console.log('✓ Test 2 Passed: RBAC_HELPER_MAP aligns with firestore.rules definitions');
}

// Test 3: diagnoseFirestorePermissionError parses JSON error from System Health
{
  const testError = 'Status : FAILED : {"error":"Missing or insufficient permissions.","authInfo":{"userId":"pmSaKqfRHRXwJqiV7DWRQvpIIhz2","email":null,"emailVerified":false,"isAnonymous":false,"tenantId":null,"providerInfo":[{"providerId":"google.com","email":null}]},"operationType":"delete","path":"products"}';
  const diag = diagnoseFirestorePermissionError(testError);
  assert(diag.isPermissionError === true, 'Must detect permission error');
  assert(diag.operationType === 'delete', 'Must identify delete operation');
  assert(diag.collectionPath === 'products', 'Must identify products collection');
  assert(diag.userId === 'pmSaKqfRHRXwJqiV7DWRQvpIIhz2', 'Must identify user ID');
  assert(diag.suggestedFix !== undefined, 'Must provide suggested fix');
  assert(diag.suggestedFix?.ruleStatement === 'allow delete: if isOwner();', 'Fix must suggest allow delete: if isOwner();');
  console.log('✓ Test 3 Passed: diagnoseFirestorePermissionError accurately diagnoses the reported error');
}

// Test 4: General rule suggestion helper
{
  const genRule = suggestFirestoreSecurityRule('payrolls', 'write', 'OWNER');
  assert(genRule.ruleStatement === 'allow write: if isOwner();', 'Must generate correct rule statement for custom collection');
  console.log('✓ Test 4 Passed: suggestFirestoreSecurityRule works for general collections');
}

console.log('ALL SECURITY RULES HELPER TESTS PASSED SUCCESSFULLY!');
