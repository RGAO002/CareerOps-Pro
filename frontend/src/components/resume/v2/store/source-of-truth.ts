// frontend/src/components/resume/v2/store/source-of-truth.ts
import type { EditorId, TransactionId, UpdateOrigin, UpdateOriginType } from '../types';

let _txnCounter: TransactionId = 0;

export function nextTransactionId(): TransactionId {
  _txnCounter += 1;
  return _txnCounter;
}

export function makeOrigin(
  type: UpdateOriginType,
  editorId?: EditorId,
): UpdateOrigin {
  return { type, editorId, transactionId: nextTransactionId() };
}

/** True if this update originated from the given editor instance.
 *  Used by store.subscribe listeners to skip self-bounces. */
export function isOriginatedBy(origin: UpdateOrigin, editorId: EditorId): boolean {
  return origin.editorId === editorId;
}

/** Reset txn counter — test-only. */
export function _resetTransactionCounter(): void {
  _txnCounter = 0;
}
