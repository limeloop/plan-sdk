// Ergonomic aliases over the generated types. `Record<string, never>` below
// is openapi-typescript's rendering of utoipa's `Object` schema (arbitrary
// JSON); the real shape is whatever's in `attributes`/`attribute_schemas`.
import type { components } from './generated-types.js';

type ObjectValue = Record<string, unknown>;
type WithObject<T, K extends keyof T> = Omit<T, K> & Record<K, ObjectValue>;

export type WorkItemFull = WithObject<components['schemas']['WorkItemFull'], 'attributes'>;
export type WorkItemCrew = WithObject<components['schemas']['WorkItemCrew'], 'attributes'>;
export type WorkItem = WorkItemFull | WorkItemCrew;

export type PersonAdmin = components['schemas']['PersonAdmin'];
export type PersonStaff = components['schemas']['PersonStaff'];
export type PersonCrew = components['schemas']['PersonCrew'];
export type Person = PersonAdmin | PersonStaff | PersonCrew;

export type Team = components['schemas']['TeamView'];
export type TeamMember = components['schemas']['TeamMemberView'];
export type Unit = components['schemas']['UnitView'];
export type UnitRef = components['schemas']['UnitRef'];
export type Word = components['schemas']['WordView'];
export type Category = components['schemas']['CategoryView'];
export type Config = WithObject<components['schemas']['ConfigView'], 'attribute_schemas'> & {
  attribute_schemas: Record<string, ObjectValue>;
};
export type MePerson = components['schemas']['MePerson'];
export type Me = components['schemas']['MeView'];

export type WorkItemCreateInput = components['schemas']['WorkItemCreateBody'];
export type WorkItemUpdateInput = Omit<components['schemas']['PatchBody'], 'version'>;
export type TeamCreateInput = components['schemas']['TeamCreateBody'];
export type TeamAddMemberInput = components['schemas']['AddMemberBody'];

/** What was loaded, so an update can be sent with the version it was loaded at. */
export interface Versioned {
  version: number;
}
