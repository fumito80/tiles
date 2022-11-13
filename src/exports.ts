import { Store } from './store';

export type StoreStates = Parameters<Parameters<Store['subscribe']>[1]>[0]['states'];
