import type {SentryEvent as SentryEventBase} from '@sentry/types';

// Although SentryEvent.tags is declared as an index signature object, it is actually an array of
// arrays i.e. [['key0', 'value0'], ['key1', 'value1']].
export type Tags = null | [string, string][];

export interface SentryEvent extends Omit<SentryEventBase, 'tags'> {
  tags?: Tags | null;
}
