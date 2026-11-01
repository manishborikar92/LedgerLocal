import 'fake-indexeddb/auto';
import { MemoryProjectRepository } from '@/adapters/memory/MemoryProjectRepository';
import { IndexedDbProjectRepository } from '@/adapters/idb/IndexedDbProjectRepository';
import { repositoryContract } from './repository.contract';

repositoryContract('in-memory adapter', () => new MemoryProjectRepository());
let n = 0;
repositoryContract('IndexedDB adapter (fake-indexeddb)', () => new IndexedDbProjectRepository(`ll-test-${n++}`));
